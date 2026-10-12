import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../server/app.js';
import type { Generator } from '../server/generation.js';
import { closePools, ownerPool, pool, withUser } from '../server/db.js';
import { hashPassword, hashToken } from '../server/security.js';
import { indexPendingTickets, retrieve } from '../server/knowledge.js';
import { setupDatabase } from '../scripts/db-setup.js';

const demoPassword = 'Demo!Fluxsus2026';
const apiOrigin = 'http://127.0.0.1:3001';
const capturedPrompts: Array<Array<{ role: 'system' | 'user' | 'assistant'; content: string }>> = [];
const fakeGenerator: Generator = {
  configured: true,
  async generate(messages) {
    capturedPrompts.push(messages.map((message) => ({ ...message })));
    const latestUser = [...messages].reverse().find((message) => message.role === 'user');
    const current = latestUser ? JSON.parse(latestUser.content) as { evidencias_nao_confiaveis?: Array<{ id: string }> } : {};
    const sourceIds = current.evidencias_nao_confiaveis?.map((source) => source.id) ?? [];
    return JSON.stringify({
      answer: sourceIds.length ? 'Resposta de teste baseada nas fontes autorizadas.' : 'Não encontrei evidência suficiente.',
      sourceIds,
      abstain: sourceIds.length === 0,
    });
  },
};

type UserId = 'ana' | 'bruno' | 'carla' | 'diego' | 'elisa' | 'fabio' | 'gabriela' | 'henrique';
type Session = { cookie: string; userId: UserId | string };
type ApiTicket = { id: number; title: string; description: string; status: string; version: number };
type ApiSource = { id: string; title?: string; excerpt?: string };

let app: FastifyInstance | undefined;
const sessionCache = new Map<string, Promise<Session>>();
const sessionTokenHashes = new Set<string>();
const baseline2233Grants = new Map<string, { active: boolean; granted_by: string; created_at: string } | null>();
const temporaryTicketIds = new Set<number>();
const temporaryConversationIds = new Set<string>();
const temporaryUserIds = new Set<string>();

function cookieFrom(response: { headers: Record<string, string | string[] | number | undefined> }): string {
  const setCookie = response.headers['set-cookie'];
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (typeof raw !== 'string') throw new Error('Login bem-sucedido não definiu cookie de sessão.');
  return raw.split(';', 1)[0]!;
}

async function login(userId: UserId | string, password = demoPassword): Promise<Session> {
  const key = `${userId}\u0000${password}`;
  const cached = sessionCache.get(key);
  if (cached) return cached;
  const pending = (async () => {
    const response = await app!.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: apiOrigin },
      payload: { email: `${userId}@fluxsus.example`, password },
    });
    expect(response.statusCode).toBe(200);
    const cookie = cookieFrom(response);
    sessionTokenHashes.add(hashToken(cookie.slice('fluxsus_session='.length)));
    return { cookie, userId };
  })();
  sessionCache.set(key, pending);
  try {
    return await pending;
  } catch (error) {
    sessionCache.delete(key);
    throw error;
  }
}

async function request(
  method: 'GET' | 'POST' | 'DELETE',
  url: string,
  session?: Session,
  payload?: unknown,
  origin = apiOrigin,
) {
  const headers: Record<string, string> = { origin };
  if (session) headers.cookie = session.cookie;
  return app!.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: JSON.stringify(payload), headers: {...headers,'content-type':'application/json'} }) });
}

function responseBody<T>(response: { json(): unknown }): T {
  return response.json() as T;
}

async function createTicket(session: Session, marker = `integration-${randomUUID()}`): Promise<ApiTicket> {
  const response = await request('POST', '/api/tickets', session, {
    title: `Ticket temporário ${marker}`,
    description: `Descrição de teste isolada ${marker}; nenhum dado real.`,
    category: 'infraestrutura',
    priority: 'normal',
  });
  expect([200, 201]).toContain(response.statusCode);
  const ticket = responseBody<{ ticket: ApiTicket }>(response).ticket;
  temporaryTicketIds.add(ticket.id);
  return ticket;
}

async function restoreTemporaryData() {
  const db = await ownerPool.connect();
  try {
    for (const conversationId of temporaryConversationIds) {
      await db.query('DELETE FROM messages WHERE conversation_id = $1', [conversationId]);
      await db.query('DELETE FROM conversations WHERE id = $1', [conversationId]);
    }
    temporaryConversationIds.clear();

    for (const ticketId of temporaryTicketIds) {
      await db.query('DELETE FROM chunks WHERE ticket_id = $1', [ticketId]);
      await db.query('DELETE FROM ticket_events WHERE ticket_id = $1', [ticketId]);
      await db.query('DELETE FROM ticket_participants WHERE ticket_id = $1', [ticketId]);
      await db.query('DELETE FROM ticket_grants WHERE ticket_id = $1', [ticketId]);
      await db.query('DELETE FROM tickets WHERE id = $1', [ticketId]);
    }
    temporaryTicketIds.clear();

    for (const userId of temporaryUserIds) {
      await db.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
      await db.query('DELETE FROM user_memory WHERE user_id = $1', [userId]);
      await db.query('DELETE FROM audit_log WHERE user_id = $1', [userId]);
      await db.query('DELETE FROM llm_usage WHERE user_id = $1', [userId]);
      await db.query('DELETE FROM users WHERE id = $1', [userId]);
    }
    temporaryUserIds.clear();

    for (const [userId, original] of baseline2233Grants) {
      await db.query('DELETE FROM ticket_grants WHERE ticket_id = 2233 AND user_id = $1', [userId]);
      if (original) {
        await db.query(
          'INSERT INTO ticket_grants(ticket_id,user_id,granted_by,active,created_at) VALUES(2233,$1,$2,$3,$4)',
          [userId, original.granted_by, original.active, original.created_at],
        );
      }
    }
  } finally {
    db.release();
  }
}

describe('API + PostgreSQL integration', () => {
  beforeAll(async () => {
    await setupDatabase();
    for (const userId of ['bruno', 'henrique']) {
      const grant = await ownerPool.query(
        'SELECT active, granted_by, created_at FROM ticket_grants WHERE ticket_id=2233 AND user_id=$1',
        [userId],
      );
      baseline2233Grants.set(userId, grant.rows[0] ?? null);
    }
    app = await buildApp({ generator: fakeGenerator });
    await app.ready();
  }, 180_000);

  afterEach(async () => {
    await restoreTemporaryData();
    capturedPrompts.length = 0;
  });

  afterAll(async () => {
    try {
      if (app) await app.close();
      await restoreTemporaryData();
      if (sessionTokenHashes.size) {
        await ownerPool.query('DELETE FROM sessions WHERE token_hash=ANY($1::text[])', [Array.from(sessionTokenHashes)]);
      }
    } finally {
      await closePools();
    }
  });

  it('returns a generic login failure and never serializes a password hash', async () => {
    const response = await request('POST', '/api/auth/login', undefined, {
      email: 'ana@fluxsus.example',
      password: 'senha-incorreta',
    });
    expect([400, 401]).toContain(response.statusCode);
    const body = responseBody<Record<string, unknown>>(response);
    expect(body).not.toHaveProperty('password_hash');
    expect(JSON.stringify(body)).not.toMatch(/scrypt\$|password_hash|Demo!Fluxsus2026/);

    const missing = await request('POST', '/api/auth/login', undefined, {
      email: `ausente-${randomUUID()}@fluxsus.example`,
      password: 'senha-incorreta',
    });
    expect(missing.statusCode).toBe(response.statusCode);
    expect(JSON.stringify(missing.json())).not.toMatch(/não existe|inexistente|ausente/i);
  });

  it('binds /auth/me to the session identity and omits credentials', async () => {
    const ana = await login('ana');
    const response = await request('GET', '/api/auth/me', ana);
    expect(response.statusCode).toBe(200);
    const body = responseBody<{ user: { id: string; role: string }; providerConfigured: boolean }>(response);
    expect(body.user).toMatchObject({ id: 'ana', role: 'solicitante' });
    expect(typeof body.providerConfigured).toBe('boolean');
    expect(JSON.stringify(body)).not.toMatch(/password_hash|scrypt\$/);
  });

  it('lets Ana read ticket 2233 but hides it from Bruno and from an administrator without a grant', async () => {
    const [ana, bruno, henrique] = await Promise.all([login('ana'), login('bruno'), login('henrique')]);
    await ownerPool.query('DELETE FROM ticket_grants WHERE ticket_id=2233 AND user_id IN ($1,$2)', ['bruno', 'henrique']);

    const anaRead = await request('GET', '/api/tickets/2233', ana);
    expect(anaRead.statusCode).toBe(200);
    expect(responseBody<{ ticket: ApiTicket }>(anaRead).ticket.id).toBe(2233);

    for (const session of [bruno, henrique]) {
      const hidden = await request('GET', '/api/tickets/2233', session);
      expect([403, 404]).toContain(hidden.statusCode);
      expect(JSON.stringify(hidden.json())).not.toMatch(/Manutenção da impressora|resolvido|2233/);
    }

    const brunoList = await request('GET', '/api/tickets', bruno);
    expect(brunoList.statusCode).toBe(200);
    const listed = responseBody<{ tickets: ApiTicket[] }>(brunoList).tickets;
    expect(listed.some((ticket) => ticket.id === 2233)).toBe(false);
  });

  it('grants and revokes Bruno ticket 2233 access without turning the grant into participation', async () => {
    const henrique = await login('henrique');
    const bruno = await login('bruno');
    await ownerPool.query('DELETE FROM ticket_grants WHERE ticket_id=2233 AND user_id=$1', ['bruno']);

    const noInitialAccess = await request('GET', '/api/tickets/2233', bruno);
    expect([403, 404]).toContain(noInitialAccess.statusCode);

    const grant = await request('POST', '/api/admin/grants', henrique, { ticketId: 2233, userId: 'bruno' });
    expect([200, 201]).toContain(grant.statusCode);
    const afterGrant = await request('GET', '/api/tickets/2233', bruno);
    expect(afterGrant.statusCode).toBe(200);

    const revoke = await request('DELETE', '/api/admin/grants/2233/bruno', henrique);
    expect([200, 204]).toContain(revoke.statusCode);
    const afterRevoke = await request('GET', '/api/tickets/2233', bruno);
    expect([403, 404]).toContain(afterRevoke.statusCode);
  });

  it('revalidates ticket sources and gives the same denial for inaccessible and missing IDs', async () => {
    const ana = await login('ana');
    const bruno = await login('bruno');

    const allowed = await request('GET', '/api/sources/ticket:2233', ana);
    expect(allowed.statusCode).toBe(200);
    expect(responseBody<{ source: ApiSource & { ticketId: number } }>(allowed).source.ticketId).toBe(2233);

    const denied = await request('GET', '/api/sources/ticket:2233', bruno);
    const missing = await request('GET', '/api/sources/ticket:999999', bruno);
    expect(denied.statusCode).toBe(404);
    expect(missing.statusCode).toBe(404);
    expect(denied.json()).toEqual(missing.json());
    expect(JSON.stringify(denied.json())).not.toMatch(/Manutenção da impressora|resolvido|2233/);
  });

  it('keeps a comment author participating after the temporary grant is revoked', async () => {
    const ana = await login('ana');
    const carla = await login('carla');
    const henrique = await login('henrique');
    const ticket = await createTicket(ana);

    const beforeGrant = await request('GET', `/api/tickets/${ticket.id}`, carla);
    expect([403, 404]).toContain(beforeGrant.statusCode);

    const grant = await request('POST', '/api/admin/grants', henrique, { ticketId: ticket.id, userId: 'carla' });
    expect([200, 201]).toContain(grant.statusCode);
    const comment = await request('POST', `/api/tickets/${ticket.id}/comments`, carla, { content: 'Comentário temporário de integração.' });
    expect([200, 201]).toContain(comment.statusCode);

    const revoke = await request('DELETE', `/api/admin/grants/${ticket.id}/carla`, henrique);
    expect([200, 204]).toContain(revoke.statusCode);
    const readAsParticipant = await request('GET', `/api/tickets/${ticket.id}`, carla);
    expect(readAsParticipant.statusCode).toBe(200);
    const details = responseBody<{ events: Array<{ content: string }> }>(readAsParticipant);
    expect(details.events.some((event) => event.content.includes('Comentário temporário'))).toBe(true);
  });

  it('hides linked conversation messages and memory references after a nonparticipant grant is revoked', async () => {
    const bruno = await login('bruno');
    const henrique = await login('henrique');
    await ownerPool.query('DELETE FROM ticket_grants WHERE ticket_id=2233 AND user_id=$1', ['bruno']);
    const granted = await request('POST', '/api/admin/grants', henrique, { ticketId: 2233, userId: 'bruno' });
    expect([200, 201]).toContain(granted.statusCode);

    const created = await request('POST', '/api/conversations', bruno);
    expect([200, 201]).toContain(created.statusCode);
    const conversationId = responseBody<{ conversation: { id: string } }>(created).conversation.id;
    temporaryConversationIds.add(conversationId);

    const first = await request('POST', '/api/chat', bruno, {
      message: 'O ticket #2233 já foi encerrado?', conversationId,
    });
    expect(first.statusCode).toBe(200);
    expect(responseBody<{ result: string }>(first).result).toBe('respondido');
    const storedBeforeRevoke = await ownerPool.query(
      'SELECT count(*)::int count FROM messages WHERE conversation_id=$1 AND 2233=ANY(ticket_ids)',
      [conversationId],
    );
    expect(storedBeforeRevoke.rows[0].count).toBe(2);

    const revoked = await request('DELETE', '/api/admin/grants/2233/bruno', henrique);
    expect([200, 204]).toContain(revoked.statusCode);
    const hiddenAtRls = await withUser('bruno', (db) => db.query(
      'SELECT id FROM messages WHERE conversation_id=$1', [conversationId],
    ));
    expect(hiddenAtRls.rowCount).toBe(0);
    const hiddenInHistory = await request('GET', `/api/conversations/${conversationId}`, bruno);
    expect(hiddenInHistory.statusCode).toBe(200);
    expect(responseBody<{ messages: unknown[] }>(hiddenInHistory).messages).toEqual([]);

    const memory = await request('GET', '/api/memory', bruno);
    expect(responseBody<{ recentTicketIds: number[] }>(memory).recentTicketIds).not.toContain(2233);
    const followUp = await request('POST', '/api/chat', bruno, {
      message: 'E essa situação, qual foi o resultado?', conversationId,
    });
    expect(followUp.statusCode).toBe(200);
    const followUpBody = responseBody<{ answer: string; result: string }>(followUp);
    expect(followUpBody.result).toBe('sem_evidencia');
    expect(followUpBody.answer).toBe('Não encontrei esse ticket entre os registros que você pode consultar.');
    expect(followUpBody.answer).not.toMatch(/2233|Manutenção da impressora|resolvido/i);
  });

  it('creates a ticket as a requester but ignores a forged administrator role on a transition', async () => {
    const ana = await login('ana');
    const ticket = await createTicket(ana);
    const response = await request('POST', `/api/tickets/${ticket.id}/transition`, ana, {
      status: 'em_andamento',
      content: 'Tentativa de transição enviada no teste.',
      version: ticket.version,
      role: 'administrador',
    });
    expect([400, 403]).toContain(response.statusCode);
    const unchanged = await request('GET', `/api/tickets/${ticket.id}`, ana);
    expect(responseBody<{ ticket: ApiTicket }>(unchanged).ticket.status).toBe('aberto');
  });

  it('rejects stale ticket versions with HTTP 409', async () => {
    const carla = await login('carla');
    const ticket = await createTicket(carla);
    const first = await request('POST', `/api/tickets/${ticket.id}/transition`, carla, {
      status: 'em_andamento',
      content: 'Início registrado pelo teste.',
      version: ticket.version,
    });
    expect(first.statusCode).toBe(200);

    const stale = await request('POST', `/api/tickets/${ticket.id}/transition`, carla, {
      status: 'aguardando',
      content: 'Versão antiga do teste.',
      version: ticket.version,
    });
    expect(stale.statusCode).toBe(409);
  });

  it('requires the current password and supports a temporary user password change', async () => {
    const userId = `itest-pass-${randomUUID()}`;
    const email = `${userId}@fluxsus.example`;
    const passwordHash = await hashPassword('SenhaInicial!Fluxsus2026');
    temporaryUserIds.add(userId);
    await ownerPool.query(
      'INSERT INTO users(id,name,email,role,password_hash) VALUES($1,$2,$3,$4,$5)',
      [userId, 'Conta temporária', email, 'solicitante', passwordHash],
    );

    const session = await login(userId, 'SenhaInicial!Fluxsus2026');
    const incorrect = await request('POST', '/api/auth/password', session, {
      currentPassword: 'SenhaErrada!',
      newPassword: 'NovaSenhaSegura!Fluxsus2026',
    });
    expect([400, 401, 403]).toContain(incorrect.statusCode);

    const changed = await request('POST', '/api/auth/password', session, {
      currentPassword: 'SenhaInicial!Fluxsus2026',
      newPassword: 'NovaSenhaSegura!Fluxsus2026',
    });
    expect([200, 204]).toContain(changed.statusCode);
    const newSession = await login(userId, 'NovaSenhaSegura!Fluxsus2026');
    expect((await request('GET', '/api/auth/me', newSession)).statusCode).toBe(200);

    const oldLogin = await request('POST', '/api/auth/login', undefined, {
      email,
      password: 'SenhaInicial!Fluxsus2026',
    });
    expect([400, 401]).toContain(oldLogin.statusCode);
  }, 60_000);

  it('invalidates an authenticated session when its user is disabled', async () => {
    const userId = `itest-disabled-${randomUUID()}`;
    const email = `${userId}@fluxsus.example`;
    temporaryUserIds.add(userId);
    await ownerPool.query(
      'INSERT INTO users(id,name,email,role,password_hash) VALUES($1,$2,$3,$4,$5)',
      [userId, 'Conta temporária inativa', email, 'solicitante', await hashPassword('SenhaInicial!Fluxsus2026')],
    );
    const session = await login(userId, 'SenhaInicial!Fluxsus2026');
    await ownerPool.query('UPDATE users SET active=false WHERE id=$1', [userId]);

    const current = await request('GET', '/api/auth/me', session);
    expect(current.statusCode).toBe(401);
    const relogin = await request('POST', '/api/auth/login', undefined, {
      email, password: 'SenhaInicial!Fluxsus2026',
    });
    expect([400, 401]).toContain(relogin.statusCode);
    expect(JSON.stringify(relogin.json())).not.toMatch(/Conta temporária|inativa|senha_hash/i);
  }, 60_000);

  it('rejects a cross-site mutation before creating a ticket', async () => {
    const ana = await login('ana');
    const marker = `origin-${randomUUID()}`;
    const response = await request('POST', '/api/tickets', ana, {
      title: `Ticket temporário ${marker}`,
      description: 'Tentativa com origem externa.',
      category: 'infraestrutura',
      priority: 'normal',
    }, 'https://origem-externa.example');
    expect([400, 403]).toContain(response.statusCode);

    const persisted = await ownerPool.query('SELECT id FROM tickets WHERE title = $1', [`Ticket temporário ${marker}`]);
    for (const row of persisted.rows as Array<{ id: number }>) temporaryTicketIds.add(row.id);
    expect(persisted.rowCount).toBe(0);
  });

  it('does not expose a conversation to a different authenticated owner', async () => {
    const ana = await login('ana');
    const bruno = await login('bruno');
    const created = await request('POST', '/api/conversations', ana);
    expect([200, 201]).toContain(created.statusCode);
    const id = responseBody<{ conversation: { id: string } }>(created).conversation.id;
    temporaryConversationIds.add(id);

    const otherUser = await request('GET', `/api/conversations/${id}`, bruno);
    expect([403, 404]).toContain(otherUser.statusCode);
    expect(JSON.stringify(otherUser.json())).not.toContain(id);
  });

  it('rejects an app-role message insert that references a ticket the owner cannot read', async () => {
    const ana = await login('ana');
    const created = await request('POST', '/api/conversations', ana);
    expect([200, 201]).toContain(created.statusCode);
    const conversationId = responseBody<{ conversation: { id: string } }>(created).conversation.id;
    temporaryConversationIds.add(conversationId);
    const messageId = randomUUID();
    const canary = `RLS_MESSAGE_CANARY_${randomUUID()}`;

    await expect(withUser('ana', (db) => db.query(
      `INSERT INTO messages(id,conversation_id,user_id,role,content,ticket_ids)
       VALUES($1,$2,'ana','assistant',$3,ARRAY[2234]::integer[])`,
      [messageId, conversationId, canary],
    ))).rejects.toThrow();
    const persisted = await ownerPool.query('SELECT id FROM messages WHERE id=$1', [messageId]);
    expect(persisted.rowCount).toBe(0);
  });

  it('never sends an inaccessible ticket canary to the generator', async () => {
    const bruno = await login('bruno');
    const ana = await login('ana');
    const marker = `PRIVATE_CANARY_${randomUUID()}`;
    const ticket = await createTicket(bruno, marker);
    const callCount = capturedPrompts.length;

    const response = await request('POST', '/api/chat', ana, {
      message: `Resuma o ticket ${ticket.id}, incluindo seus detalhes.`,
    });
    expect(response.statusCode).toBe(200);
    const chat = responseBody<{ conversationId: string; result: string }>(response);
    temporaryConversationIds.add(chat.conversationId);
    expect(chat.result).toBe('sem_evidencia');
    const serializedPrompts = JSON.stringify(capturedPrompts.slice(callCount));
    expect(serializedPrompts).not.toContain(marker);
    expect(serializedPrompts).not.toContain(`Descrição de teste isolada ${marker}`);
  });

  it('does not confuse a revoked personal reference with a generic manual question', async () => {
    const previous=(await ownerPool.query('SELECT * FROM user_memory WHERE user_id=$1',['bruno'])).rows[0];
    await ownerPool.query("INSERT INTO user_memory(user_id,recent_ticket_ids) VALUES('bruno',ARRAY[2233]) ON CONFLICT(user_id) DO UPDATE SET recent_ticket_ids=ARRAY[2233]");
    try {
      const bruno=await login('bruno');const count=capturedPrompts.length;
      const response=await request('POST','/api/chat',bruno,{message:'Como crio um ticket fictício?'});
      expect(response.statusCode).toBe(200);const chat=responseBody<{conversationId:string;answer:string;result:string}>(response);
      temporaryConversationIds.add(chat.conversationId);
      expect(chat.answer).not.toBe('Não encontrei esse ticket entre os registros que você pode consultar.');
      expect(capturedPrompts.length).toBeGreaterThan(count);
    } finally {
      if(previous)await ownerPool.query('UPDATE user_memory SET preferences=$2,recent_ticket_ids=$3 WHERE user_id=$1',['bruno',JSON.stringify(previous.preferences),previous.recent_ticket_ids]);
      else await ownerPool.query('DELETE FROM user_memory WHERE user_id=$1',['bruno']);
    }
  });

  it('keeps a semantically retrievable private canary out of retrieval and generated prompts', async () => {
    const bruno = await login('bruno');
    const ana = await login('ana');
    const marker = `SEMANTIC_PRIVATE_CANARY_${randomUUID()}`;
    const ticket = await createTicket(bruno, marker);
    await ownerPool.query(
      'UPDATE tickets SET description=$2,version=version+1,updated_at=clock_timestamp() WHERE id=$1',
      [ticket.id, 'Balança de triagem sem energia aguarda inspeção da equipe de manutenção. Equipamento fictício para teste de recuperação semântica.'],
    );
    await indexPendingTickets();

    const question = 'Como acompanhar a balança de triagem sem energia que aguarda inspeção da equipe de manutenção?';
    const visibleToOwner = await retrieve('bruno', question);
    expect(visibleToOwner.some((source) => source.ticketId === ticket.id)).toBe(true);
    const visibleToAna = await retrieve('ana', question);
    expect(visibleToAna.some((source) => source.ticketId === ticket.id)).toBe(false);

    const callCount = capturedPrompts.length;
    const response = await request('POST', '/api/chat', ana, { message: question });
    expect(response.statusCode).toBe(200);
    const chat = responseBody<{ conversationId: string; result: string }>(response);
    temporaryConversationIds.add(chat.conversationId);
    const prompt = capturedPrompts.slice(callCount);
    if (!prompt.length) {
      // With no eligible source above threshold, the correct behavior is to abstain before generation.
      expect(chat.result).toBe('sem_evidencia');
    } else {
      const current = JSON.parse(prompt.at(-1)!.findLast((message) => message.role === 'user')!.content) as {
        evidencias_nao_confiaveis: Array<{ id: string; content: string }>;
        pergunta: string;
      };
      expect(current.pergunta).toBe(question);
      expect(current.evidencias_nao_confiaveis.every((source) => !source.id.includes(String(ticket.id)))).toBe(true);
      expect(JSON.stringify(prompt)).not.toContain(marker);
      expect(JSON.stringify(prompt)).not.toContain('Balança de triagem sem energia aguarda inspeção');
    }
  }, 180_000);

  it('uses a non-superuser application role with RLS filtering ticket rows', async () => {
    const role = await pool.query(
      'SELECT current_user AS role_name, r.rolsuper, r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user',
    );
    expect(role.rows[0]).toMatchObject({ role_name: 'fluxsus_app', rolsuper: false, rolbypassrls: false });

    const hidden = await withUser('bruno', (db) => db.query('SELECT id FROM tickets WHERE id = $1', [2233]));
    expect(hidden.rowCount).toBe(0);
    const visible = await withUser('ana', (db) => db.query('SELECT id FROM tickets WHERE id = $1', [2233]));
    expect(visible.rowCount).toBe(1);
  });
});
