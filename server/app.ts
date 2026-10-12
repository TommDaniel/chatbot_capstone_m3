import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import staticPlugin from '@fastify/static';
import {randomBytes,randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {z,ZodError} from 'zod';
import {config} from './config.js';
import {pool,withUser} from './db.js';
import {hashPassword,verifyPassword,hashToken,HttpError,hiddenTicket,canTransition} from './security.js';
import {mapTicket} from './tickets.js';
import {answerChat} from './chat.js';
import {loadMemory} from './memory.js';
import {getSource} from './knowledge.js';
import {statuses,type User} from '../shared/types.js';
import type {Generator} from './generation.js';
declare module 'fastify' {interface FastifyRequest {user:User|null}}
const numericId=z.coerce.number().int().min(1).max(2147483647);
const uuid=z.string().uuid();
const ticketBody=z.object({title:z.string().trim().min(5).max(150),description:z.string().trim().min(10).max(3000),category:z.string().trim().min(2).max(80),priority:z.enum(['baixa','normal','alta'])}).strict();
const passwordOptions={path:'/',httpOnly:true,sameSite:'strict' as const,secure:config.secureCookie,maxAge:8*3600};
export async function buildApp(options:{generator?:Generator}={}){
 const app=Fastify({logger:false,bodyLimit:24*1024,trustProxy:false});
 app.decorateRequest('user',null);
 await app.register(cookie);
 await app.register(rateLimit,{max:120,timeWindow:'1 minute',hook:'preHandler',allowList:req=>!req.url.startsWith('/api/'),keyGenerator:req=>`${req.ip}:${req.user?.id??'anonymous'}`});
 app.setErrorHandler((error,request,reply)=>{const e=error as Error&{statusCode?:number;code?:string};if(e instanceof ZodError)return reply.code(400).send({error:'Entrada inválida. Verifique os campos e seus limites.'});
  if(e instanceof HttpError)return reply.code(e.statusCode).send({error:e.message});
  if(e.code==='23503')return reply.code(404).send({error:'Referência não disponível.'});
  if(e.statusCode&&e.statusCode<500)return reply.code(e.statusCode).send({error:e.statusCode===429?'Muitas tentativas. Aguarde antes de tentar novamente.':'Requisição não disponível.'});
  // Never serialize database/provider errors, credentials or prompts to the client.
  console.error('Falha interna',e.name,e.code??'');return reply.code(500).send({error:'Não foi possível concluir a operação.'});
 });
 app.addHook('onRequest',async(req,reply)=>{
  reply.header('X-Content-Type-Options','nosniff').header('Referrer-Policy','no-referrer').header('Cache-Control','no-store');
  if(['POST','PUT','DELETE','PATCH'].includes(req.method)){
   const origin=req.headers.origin;if((origin&&!config.allowedOrigins.includes(origin))||req.headers['sec-fetch-site']==='cross-site')throw new HttpError(403,'Origem não autorizada.');
  }
  if(!req.url.startsWith('/api/')||req.url.split('?')[0]==='/api/health'||req.url.split('?')[0]==='/api/auth/login')return;
  const token=req.cookies.fluxsus_session;if(!token)throw new HttpError(401,'Entre com uma conta fictícia para continuar.');
  const user=(await pool.query('SELECT * FROM resolve_session($1)',[hashToken(token)])).rows[0];if(!user)throw new HttpError(401,'Sessão expirada. Entre novamente.');req.user=user;
 });
 app.get('/api/health',async()=>{await pool.query('SELECT 1');return{status:'ok',prototype:true};});
 app.post('/api/auth/login',{config:{rateLimit:{max:10,timeWindow:'1 minute',keyGenerator:(req)=>`${req.ip}:${String((req.body as {email?:unknown})?.email??'').trim().toLowerCase()}`}}},async(req,reply)=>{
  const {email,password}=z.object({email:z.email().max(180),password:z.string().min(1).max(128)}).strict().parse(req.body);
  const row=(await pool.query('SELECT * FROM find_credentials($1)',[email.toLowerCase()])).rows[0];
  if(!row||!await verifyPassword(password,row.password_hash))throw new HttpError(401,'Email ou senha inválidos.');
  const user:User={id:row.id,name:row.name,email:row.email,role:row.role};const token=randomBytes(32).toString('base64url');
  await withUser(user.id,db=>db.query('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval \'8 hours\')',[hashToken(token),user.id]));
  reply.setCookie('fluxsus_session',token,passwordOptions);return{user};
 });
 app.get('/api/auth/me',async req=>({user:req.user,providerConfigured:options.generator?.configured??Boolean(config.key)}));
 app.post('/api/auth/logout',async(req,reply)=>{await withUser(req.user!.id,db=>db.query('DELETE FROM sessions WHERE token_hash=$1',[hashToken(req.cookies.fluxsus_session!)]));reply.clearCookie('fluxsus_session',{path:'/'});return{ok:true};});
 app.post('/api/auth/password',async(req,reply)=>{
  const body=z.object({currentPassword:z.string().max(128),newPassword:z.string().min(12).max(128)}).strict().parse(req.body);
  const row=(await pool.query('SELECT * FROM find_credentials($1)',[req.user!.email])).rows[0];if(!await verifyPassword(body.currentPassword,row.password_hash))throw new HttpError(400,'Senha atual incorreta.');
  const hash=await hashPassword(body.newPassword);await withUser(req.user!.id,async db=>{await db.query('SELECT update_my_password($1)',[hash]);await db.query('DELETE FROM sessions WHERE user_id=$1',[req.user!.id]);});
  reply.clearCookie('fluxsus_session',{path:'/'});return{ok:true};
 });
 app.get('/api/memory',async req=>{const {preferences,recentTicketIds}=await loadMemory(req.user!.id);return{preferences,recentTicketIds};});
 app.put('/api/memory',async req=>{const body=z.object({preferences:z.object({style:z.enum(['curto','detalhado'])}).strict()}).strict().parse(req.body);await withUser(req.user!.id,db=>db.query('INSERT INTO user_memory(user_id,preferences) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET preferences=excluded.preferences',[req.user!.id,JSON.stringify(body.preferences)]));const{preferences,recentTicketIds}=await loadMemory(req.user!.id);return{preferences,recentTicketIds};});
 app.delete('/api/memory',async req=>{await withUser(req.user!.id,db=>db.query('DELETE FROM user_memory WHERE user_id=$1',[req.user!.id]));return{ok:true};});
 app.get('/api/tickets',async req=>({tickets:await withUser(req.user!.id,async db=>(await db.query('SELECT * FROM tickets WHERE can_read_ticket(id) ORDER BY updated_at DESC,id DESC')).rows.map(mapTicket))}));
 app.post('/api/tickets',async req=>{const body=ticketBody.parse(req.body);return withUser(req.user!.id,async db=>{const row=(await db.query('INSERT INTO tickets(title,description,category,priority,status,created_by) VALUES($1,$2,$3,$4,\'aberto\',$5) RETURNING *',[body.title,body.description,body.category,body.priority,req.user!.id])).rows[0];await db.query('INSERT INTO ticket_events(ticket_id,actor_id,kind,content,to_status) VALUES($1,$2,\'criacao\',$3,\'aberto\')',[row.id,req.user!.id,body.description]);return{ticket:mapTicket(row)};});});
 app.get('/api/tickets/:id',async req=>{const id=numericId.parse((req.params as {id:string}).id);return withUser(req.user!.id,async db=>{const row=(await db.query('SELECT * FROM tickets WHERE id=$1 AND can_read_ticket(id)',[id])).rows[0];if(!row)throw new HttpError(404,hiddenTicket);const events=(await db.query('SELECT e.*,u.name actor_name FROM ticket_events e JOIN users u ON u.id=e.actor_id WHERE e.ticket_id=$1 ORDER BY e.created_at,e.id',[id])).rows.map(e=>({id:String(e.id),actorName:e.actor_name,kind:e.kind,content:e.content,fromStatus:e.from_status,toStatus:e.to_status,createdAt:new Date(e.created_at).toISOString()}));return{ticket:mapTicket(row),events};});});
 app.post('/api/tickets/:id/comments',async req=>{const id=numericId.parse((req.params as {id:string}).id);const{content}=z.object({content:z.string().trim().min(3).max(2000)}).strict().parse(req.body);return withUser(req.user!.id,async db=>{const row=(await db.query('SELECT * FROM tickets WHERE id=$1 AND can_read_ticket(id) FOR UPDATE',[id])).rows[0];if(!row)throw new HttpError(404,hiddenTicket);if(row.status==='encerrado')throw new HttpError(409,'O ticket encerrado é somente leitura.');await db.query('INSERT INTO ticket_events(ticket_id,actor_id,kind,content) VALUES($1,$2,\'comentario\',$3)',[id,req.user!.id,content]);const updated=(await db.query('UPDATE tickets SET version=version+1,updated_at=clock_timestamp() WHERE id=$1 RETURNING *',[id])).rows[0];return{ticket:mapTicket(updated)};});});
 app.post('/api/tickets/:id/transition',async req=>{const id=numericId.parse((req.params as {id:string}).id);const body=z.object({status:z.enum(statuses),content:z.string().trim().min(3).max(2000),version:z.number().int().positive()}).strict().parse(req.body);return withUser(req.user!.id,async db=>{const row=(await db.query('SELECT * FROM tickets WHERE id=$1 AND can_read_ticket(id) FOR UPDATE',[id])).rows[0];if(!row)throw new HttpError(404,hiddenTicket);if(row.version!==body.version)throw new HttpError(409,'O ticket mudou. Atualize a tela e tente novamente.');if(!canTransition(req.user!.role,row.status,body.status))throw new HttpError(403,'Seu cargo não permite essa transição ou o estado é incompatível.');if(body.status==='resolvido'&&body.content.length<10)throw new HttpError(400,'Descreva a resolução em pelo menos 10 caracteres.');await db.query('INSERT INTO ticket_events(ticket_id,actor_id,kind,content,from_status,to_status) VALUES($1,$2,\'evolucao\',$3,$4,$5)',[id,req.user!.id,body.content,row.status,body.status]);const updated=(await db.query('UPDATE tickets SET status=$2,version=version+1,updated_at=clock_timestamp() WHERE id=$1 RETURNING *',[id,body.status])).rows[0];return{ticket:mapTicket(updated)};});});
 function admin(req:{user:User|null}){if(req.user!.role!=='administrador')throw new HttpError(403,'Ação reservada ao administrador.');}
 app.get('/api/admin/users',async req=>{admin(req);return{users:(await pool.query('SELECT id,name,email,role FROM users WHERE active ORDER BY name')).rows};});
 app.get('/api/admin/grants/:ticketId',async req=>{admin(req);const id=numericId.parse((req.params as {ticketId:string}).ticketId);return{grants:await withUser(req.user!.id,async db=>(await db.query('SELECT g.user_id "userId",u.name "userName",g.active,g.granted_by "grantedBy",g.created_at "createdAt" FROM ticket_grants g JOIN users u ON u.id=g.user_id WHERE ticket_id=$1 ORDER BY u.name',[id])).rows)};});
 app.post('/api/admin/grants',async req=>{admin(req);const body=z.object({ticketId:numericId,userId:z.string().min(1).max(80)}).strict().parse(req.body);await withUser(req.user!.id,async db=>{await db.query('INSERT INTO ticket_grants(ticket_id,user_id,granted_by) VALUES($1,$2,$3) ON CONFLICT(ticket_id,user_id) DO UPDATE SET active=true,granted_by=excluded.granted_by,created_at=now()',[body.ticketId,body.userId,req.user!.id]);await db.query('INSERT INTO audit_log(user_id,request_id,action,metadata) VALUES($1,$2,\'grant\',$3)',[req.user!.id,randomUUID(),JSON.stringify(body)]);});return{ok:true};});
 app.delete('/api/admin/grants/:ticketId/:userId',async req=>{admin(req);const params=req.params as {ticketId:string;userId:string};const id=numericId.parse(params.ticketId);await withUser(req.user!.id,async db=>{await db.query('UPDATE ticket_grants SET active=false WHERE ticket_id=$1 AND user_id=$2',[id,params.userId]);await db.query('INSERT INTO audit_log(user_id,request_id,action,metadata) VALUES($1,$2,\'revoke\',$3)',[req.user!.id,randomUUID(),JSON.stringify({ticketId:id,userId:params.userId})]);});return{ok:true};});
 app.get('/api/conversations',async req=>({conversations:await withUser(req.user!.id,async db=>(await db.query('SELECT id,title,created_at "createdAt" FROM conversations ORDER BY created_at DESC')).rows)}));
 app.post('/api/conversations',async req=>{const id=randomUUID();return{conversation:await withUser(req.user!.id,async db=>(await db.query('INSERT INTO conversations(id,user_id) VALUES($1,$2) RETURNING id,title,created_at "createdAt"',[id,req.user!.id])).rows[0])};});
 app.get('/api/conversations/:id',async req=>{const id=uuid.parse((req.params as {id:string}).id);return withUser(req.user!.id,async db=>{if(!(await db.query('SELECT 1 FROM conversations WHERE id=$1',[id])).rowCount)throw new HttpError(404,'Conversa não disponível.');const rows=(await db.query('SELECT id,role,content,result,sources,created_at "createdAt" FROM messages WHERE conversation_id=$1 ORDER BY created_at,id',[id])).rows;return{messages:rows};});});
 app.post('/api/chat',async req=>{const body=z.object({message:z.string().trim().min(1).max(2000),conversationId:uuid.optional()}).strict().parse(req.body);return answerChat(req.user!,body,options.generator);});
 app.get('/api/sources/:id',async req=>{const id=z.string().max(180).parse((req.params as {id:string}).id);const source=await getSource(req.user!.id,id);if(!source)throw new HttpError(404,'Fonte não disponível no seu acesso atual.');return{source};});
 const webRoot=resolve('dist/web');if(existsSync(webRoot)){await app.register(staticPlugin,{root:webRoot});app.setNotFoundHandler((req,reply)=>{if(req.url.startsWith('/api/'))return reply.code(404).send({error:'Rota não disponível.'});return reply.sendFile('index.html');});}
 return app;
}
