import 'dotenv/config';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { expect, test, type Page } from '@playwright/test';

const { Pool } = pg;
const demoPassword = 'Demo!Fluxsus2026';
const screenshotDirectory = path.resolve('output/screenshots');
const ownerPool = new Pool({
  connectionString: process.env.MIGRATION_DATABASE_URL
    ?? 'postgresql://fluxsus_owner:fluxsus_local_owner_2026@127.0.0.1:55432/fluxsus',
  max: 1,
});

const createdTicketIds = new Set<number>();
const createdConversationIds = new Set<string>();
const createdSessionHashes = new Set<string>();
const memoryUserIds = ['ana', 'bruno'];
const originalMemories = new Map<string, { preferences: unknown; recent_ticket_ids: number[] } | null>();
let deepSeekRequestCount = 0;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await mkdir(screenshotDirectory, { recursive: true });
  for (const userId of memoryUserIds) {
    const result = await ownerPool.query(
      'SELECT preferences, recent_ticket_ids FROM user_memory WHERE user_id = $1',
      [userId],
    );
    originalMemories.set(userId, result.rows[0] ?? null);
  }
});

test.afterAll(async () => {
  const client = await ownerPool.connect();
  try {
    await client.query('BEGIN');
    const ticketIds = [...createdTicketIds];
    if (ticketIds.length) {
      await client.query(
        `DELETE FROM audit_log
         WHERE action IN ('grant', 'revoke') AND metadata->>'ticketId' = ANY($1::text[])`,
        [ticketIds.map(String)],
      );
      await client.query('DELETE FROM chunks WHERE ticket_id = ANY($1::integer[])', [ticketIds]);
      await client.query('DELETE FROM ticket_events WHERE ticket_id = ANY($1::integer[])', [ticketIds]);
      await client.query('DELETE FROM ticket_participants WHERE ticket_id = ANY($1::integer[])', [ticketIds]);
      await client.query('DELETE FROM ticket_grants WHERE ticket_id = ANY($1::integer[])', [ticketIds]);
      await client.query('DELETE FROM tickets WHERE id = ANY($1::integer[])', [ticketIds]);
    }

    const conversationIds = [...createdConversationIds];
    if (conversationIds.length) {
      await client.query('DELETE FROM messages WHERE conversation_id = ANY($1::uuid[])', [conversationIds]);
      await client.query('DELETE FROM conversations WHERE id = ANY($1::uuid[])', [conversationIds]);
    }

    const sessionHashes = [...createdSessionHashes];
    if (sessionHashes.length) {
      await client.query('DELETE FROM sessions WHERE token_hash = ANY($1::text[])', [sessionHashes]);
    }

    for (const [userId, memory] of originalMemories) {
      if (memory) {
        await client.query(
          `INSERT INTO user_memory(user_id, preferences, recent_ticket_ids)
           VALUES ($1, $2, $3)
           ON CONFLICT(user_id) DO UPDATE
           SET preferences = excluded.preferences, recent_ticket_ids = excluded.recent_ticket_ids`,
          [userId, JSON.stringify(memory.preferences), memory.recent_ticket_ids],
        );
      } else {
        await client.query('DELETE FROM user_memory WHERE user_id = $1', [userId]);
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await ownerPool.end();
  }
});

test.beforeEach(async ({ page }) => {
  page.on('request', (request) => {
    if (new URL(request.url()).hostname === 'api.deepseek.com') deepSeekRequestCount += 1;
  });
  page.on('response', (response) => {
    if (response.request().method() !== 'POST') return;
    const pathname = new URL(response.url()).pathname;
    if (pathname !== '/api/conversations' && pathname !== '/api/chat') return;
    void response.json().then((body: { conversation?: { id?: string }; conversationId?: string }) => {
      const id = body.conversation?.id ?? body.conversationId;
      if (id) createdConversationIds.add(id);
    }).catch(() => undefined);
  });
});

async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: path.join(screenshotDirectory, `${name}.png`), fullPage: true, animations: 'disabled' });
}

async function login(page: Page, userId: string) {
  await page.goto('/');
  await expect(page.getByLabel('Conta de demonstração')).toBeVisible();
  await page.getByLabel('Conta de demonstração').selectOption(`${userId}@fluxsus.example`);
  await page.getByLabel('Senha').fill(demoPassword);
  await page.getByRole('button', { name: 'Entrar no ambiente' }).click();
  await expect(page.getByRole('button', { name: 'Assistente', exact: true })).toBeVisible();
  await rememberSession(page);
}

async function rememberSession(page: Page) {
  const sessionCookie = (await page.context().cookies()).find((cookie) => cookie.name === 'fluxsus_session');
  if (sessionCookie) createdSessionHashes.add(createHash('sha256').update(sessionCookie.value).digest('hex'));
}

async function logout(page: Page) {
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page.getByRole('heading', { name: 'Acompanhe cada solicitação com contexto.' })).toBeVisible();
}

async function openTickets(page: Page) {
  await page.getByRole('button', { name: 'Tickets', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tickets', exact: true })).toBeVisible();
}

async function sendQuestion(page: Page, question: string) {
  await page.getByLabel('Escreva sua pergunta').fill(question);
  await page.getByRole('button', { name: 'Enviar mensagem' }).click();
  const answer = page.locator('.assistant-answer').last();
  await expect(answer).not.toHaveText('', { timeout: 15_000 });
  return answer;
}

async function grantAccess(page: Page, ticketId: number, userId: string, userName: string) {
  await page.getByLabel('Número do ticket', { exact: true }).fill(String(ticketId));
  await page.getByLabel('Usuário', { exact: true }).selectOption(userId);
  await page.getByRole('button', { name: 'Conceder acesso' }).click();
  await expect(page.locator('.notice-success').last()).toContainText(`Acesso concedido a ${userName}.`);
}

test('autentica usuários, responde sobre o ticket 2233, mantém o follow-up e esconde o ticket de Bruno', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Acompanhe cada solicitação com contexto.' })).toBeVisible();
  await screenshot(page, 'login');

  await page.getByLabel('Conta de demonstração').selectOption('ana@fluxsus.example');
  await page.getByLabel('Senha').fill(demoPassword);
  await page.getByRole('button', { name: 'Entrar no ambiente' }).click();
  await expect(page.getByRole('heading', { name: 'Conversas' })).toBeVisible();
  await rememberSession(page);
  await expect(page.getByRole('button', { name: 'Acessos', exact: true })).toHaveCount(0);

  const firstAnswer = await sendQuestion(page, 'O ticket 2233 já foi encerrado?');
  await expect(firstAnswer).toContainText('Estado atual: resolvido');
  await expect(firstAnswer).toContainText('não encerrado');
  await expect(page.getByRole('heading', { name: 'Fontes consultadas' })).toBeVisible();
  const sourceButton = page.getByRole('button', { name: /Ticket #2233:/ }).last();
  await sourceButton.click();
  await expect(page.locator('.source-detail').last()).toContainText('Estado atual: resolvido');

  const followUp = await sendQuestion(page, 'E ele já foi encerrado?');
  await expect(followUp).toContainText('Estado atual: resolvido');
  await expect(followUp).toContainText('não encerrado');
  await screenshot(page, 'assistant');

  await openTickets(page);
  await page.getByLabel('Buscar ticket por número ou título').fill('2233');
  await expect(page.getByRole('button', { name: /#2233/ })).toBeVisible();
  await screenshot(page, 'tickets');

  await logout(page);
  await login(page, 'bruno');
  const denied = await sendQuestion(page, 'O ticket 2233 já foi encerrado?');
  await expect(denied).not.toContainText('Manutenção da impressora');
  await expect(denied).not.toContainText('Estado atual:');
  await expect(denied).not.toContainText('Ticket #2233');
  expect(deepSeekRequestCount).toBe(0);
});

test('cria ticket, registra comentário, aplica concessões, valida os papéis e revoga acesso', async ({ page, browser }) => {
  await login(page, 'ana');
  await openTickets(page);

  const ticketTitle = `E2E temporário ${randomUUID().slice(0, 8)}`;
  await page.getByRole('button', { name: 'Criar ticket', exact: true }).click();
  const createDialog = page.getByRole('dialog', { name: 'Criar ticket' });
  await expect(createDialog.getByLabel('Título')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(createDialog.getByRole('button', { name: 'Fechar', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(createDialog.getByRole('button', { name: 'Criar ticket', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(createDialog.getByRole('button', { name: 'Fechar', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(createDialog.getByLabel('Título')).toBeFocused();
  await createDialog.getByLabel('Título').fill(ticketTitle);
  await createDialog.getByLabel('Descrição').fill('Solicitação sintética para validar o fluxo Playwright.');
  await createDialog.getByRole('button', { name: 'Criar ticket', exact: true }).click();

  const creationNotice = page.locator('.notice-success').filter({ hasText: /Ticket #\d+ criado\./ });
  await expect(creationNotice).toBeVisible();
  const ticketIdMatch = (await creationNotice.innerText()).match(/Ticket #(\d+) criado\./);
  expect(ticketIdMatch).not.toBeNull();
  const ticketId = Number(ticketIdMatch![1]);
  createdTicketIds.add(ticketId);
  await expect(page.getByRole('heading', { name: ticketTitle })).toBeVisible();

  const comment = `Comentário E2E ${randomUUID().slice(0, 8)}.`;
  await page.getByLabel('Adicionar comentário').fill(comment);
  await page.getByRole('button', { name: 'Comentar' }).click();
  await expect(page.getByText(comment, { exact: true })).toBeVisible();
  await screenshot(page, 'tickets');

  await logout(page);
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await login(adminPage, 'henrique');
  await adminPage.getByRole('button', { name: 'Acessos', exact: true }).click();
  await expect(adminPage.getByRole('heading', { name: 'Acessos', exact: true })).toBeVisible();

  await grantAccess(adminPage, ticketId, 'carla', 'Carla Mendes');
  await grantAccess(adminPage, ticketId, 'elisa', 'Elisa Rocha');
  await grantAccess(adminPage, ticketId, 'bruno', 'Bruno Costa');
  await screenshot(adminPage, 'accesses');

  await login(page, 'carla');
  await openTickets(page);
  await expect(page.getByRole('heading', { name: ticketTitle, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Iniciar atendimento' }).click();
  const startDialog = page.getByRole('dialog');
  await startDialog.getByLabel('Comentário da atualização').fill('Atendimento iniciado para o ensaio E2E.');
  await startDialog.getByRole('button', { name: 'Atualizar ticket' }).click();
  await expect(page.locator('.ticket-detail-header').getByText('Em andamento', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Aguardar informação' }).click();
  const waitingDialog = page.getByRole('dialog');
  await waitingDialog.getByLabel('Comentário da atualização').fill('Aguardando retorno simulado para o ensaio.');
  await waitingDialog.getByRole('button', { name: 'Atualizar ticket' }).click();
  await expect(page.locator('.ticket-detail-header').getByText('Aguardando', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Retomar atendimento' }).click();
  const resumeDialog = page.getByRole('dialog');
  await resumeDialog.getByLabel('Comentário da atualização').fill('Retomada registrada no ensaio E2E.');
  await resumeDialog.getByRole('button', { name: 'Atualizar ticket' }).click();
  await expect(page.locator('.ticket-detail-header').getByText('Em andamento', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Resolver ticket' }).click();
  const resolveDialog = page.getByRole('dialog');
  await resolveDialog.getByLabel('Descrição da resolução').fill('Serviço sintético validado e funcionamento confirmado.');
  await resolveDialog.getByRole('button', { name: 'Confirmar resolução' }).click();
  await expect(page.locator('.ticket-detail-header').getByText('Resolvido', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Encerrar ticket' })).toHaveCount(0);

  await logout(page);
  await login(page, 'elisa');
  await openTickets(page);
  await expect(page.getByRole('heading', { name: ticketTitle, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Encerrar ticket' })).toBeVisible();
  await page.getByRole('button', { name: 'Encerrar ticket' }).click();
  const closeDialog = page.getByRole('dialog');
  await closeDialog.getByLabel('Comentário da atualização').fill('Encerramento confirmado no ensaio E2E.');
  await closeDialog.getByRole('button', { name: 'Encerrar ticket' }).click();
  await expect(page.locator('.ticket-detail-header').getByText('Encerrado', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Adicionar comentário')).toHaveCount(0);

  await logout(page);
  await login(page, 'bruno');
  await openTickets(page);
  await expect(page.locator('.ticket-row').filter({ hasText: ticketTitle })).toBeVisible();
  await page.getByRole('button', { name: 'Assistente', exact: true }).click();
  const grantedAnswer = await sendQuestion(page, `Qual é o estado do ticket ${ticketId}?`);
  await expect(grantedAnswer).toContainText('Estado atual: encerrado');
  expect(deepSeekRequestCount).toBe(0);

  await adminPage.getByLabel('Consultar pelo número do ticket').fill(String(ticketId));
  await adminPage.getByRole('button', { name: 'Consultar' }).click();
  const brunoGrant = adminPage.locator('.grant-row').filter({ hasText: 'Bruno Costa' });
  await expect(brunoGrant).toBeVisible();
  await brunoGrant.getByRole('button', { name: 'Revogar' }).click();
  await expect(adminPage.locator('.notice-success').last()).toContainText('Acesso revogado.');
  await expect(adminPage.locator('.grant-row').filter({ hasText: 'Bruno Costa' })).toHaveCount(0);
  await adminContext.close();

  const revokedAnswer = await sendQuestion(page, `Qual é o estado do ticket ${ticketId}?`);
  await expect(revokedAnswer).not.toContainText(ticketTitle);
  await expect(revokedAnswer).not.toContainText('Estado atual:');
  await openTickets(page);
  await expect(page.locator('.ticket-row').filter({ hasText: ticketTitle })).toHaveCount(0);
  expect(deepSeekRequestCount).toBe(0);
});

test('persiste a preferência, limpa a memória e mantém a navegação móvel utilizável', async ({ page }) => {
  await login(page, 'ana');
  await page.getByRole('button', { name: 'Minha conta', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Minha conta', exact: true })).toBeVisible();
  await screenshot(page, 'account');

  const detailedPreference = page.getByRole('radio', { name: /Detalhadas/ });
  await detailedPreference.check();
  await page.getByRole('button', { name: 'Salvar preferência' }).click();
  await expect(page.locator('.notice-success').last()).toContainText('Preferência salva.');

  await page.reload();
  await expect(page.getByRole('button', { name: 'Minha conta', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Minha conta', exact: true }).click();
  await expect(page.getByRole('radio', { name: /Detalhadas/ })).toBeChecked();

  const clearMemory = page.getByRole('button', { name: 'Limpar memória' });
  if (await clearMemory.isEnabled()) {
    await clearMemory.click();
    await expect(page.getByText('Nenhuma referência recente')).toBeVisible();
    await expect(clearMemory).toBeDisabled();
  }

  await page.setViewportSize({ width: 390, height: 844 });
  const menu = page.getByRole('button', { name: 'Abrir navegação' });
  await expect(menu).toBeVisible();
  await menu.click();
  await page.getByRole('button', { name: 'Tickets', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tickets', exact: true })).toBeVisible();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.nav-scrim')).toHaveCount(0);
  await screenshot(page, 'mobile');

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(hasHorizontalOverflow).toBe(false);
});
