import { readFile } from 'node:fs/promises';
import { ownerPool,closePools } from '../server/db.js';
import { config } from '../server/config.js';
import { hashPassword } from '../server/security.js';
export const seedUsers=[
 ['ana','Ana Ribeiro','solicitante'],['bruno','Bruno Costa','solicitante'],['carla','Carla Mendes','operador'],['diego','Diego Lima','operador'],
 ['elisa','Elisa Rocha','supervisor'],['fabio','Fábio Alves','supervisor'],['gabriela','Gabriela Nunes','administrador'],['henrique','Henrique Souza','administrador']
];
export async function setupDatabase(){
 const db=await ownerPool.connect();
 try {
 await db.query('BEGIN');
 if(!(await db.query("SELECT 1 FROM pg_roles WHERE rolname='fluxsus_app'")).rowCount)await db.query(`CREATE ROLE fluxsus_app LOGIN PASSWORD '${config.appPassword.replaceAll("'","''")}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
 await db.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
 await db.query(await readFile(new URL('../migrations/001-initial.sql',import.meta.url),'utf8'));
 const hash=await hashPassword('Demo!Fluxsus2026');
 for(const [id,name,role] of seedUsers)await db.query('INSERT INTO users(id,name,email,role,password_hash) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING',[id,name,`${id}@fluxsus.example`,role,hash]);
 const subjects=['Manutenção da impressora da recepção','Reposição de etiquetas do almoxarifado','Verificação do ar-condicionado','Ajuste no acesso ao painel de serviços','Inspeção da iluminação do corredor','Organização do transporte interno'];
 for(let i=0;i<24;i++){
  const id=2233+i;const group=i%2===0?['ana','carla','elisa']:['bruno','diego','fabio'];
  const status=i===0?'resolvido':i===1?'encerrado':['aberto','em_andamento','aguardando','resolvido','encerrado'][i%5];
  const title=subjects[i%subjects.length]+(i>5?` - setor fictício ${Math.floor(i/6)+1}`:'');
  const inserted=await db.query('INSERT INTO tickets(id,title,description,category,priority,status,created_by,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8) ON CONFLICT(id) DO NOTHING RETURNING id',[id,title,`Solicitação operacional simulada do Hospital Aurora (instituição fictícia). ${title}. Nenhum paciente ou registro clínico envolvido.`,i%2?'suprimentos':'infraestrutura',i%3?'normal':'alta',status,group[0],'2026-10-10T12:00:00Z']);
  if(inserted.rowCount){
   for(const uid of group)await db.query('INSERT INTO ticket_participants(ticket_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,uid]);
   await db.query("INSERT INTO ticket_events(ticket_id,actor_id,kind,content,to_status,created_at) VALUES($1,$2,'criacao','Ticket fictício criado para demonstração.','aberto',$3)",[id,group[0],'2026-10-10T12:00:00Z']);
   await db.query("INSERT INTO ticket_events(ticket_id,actor_id,kind,content,from_status,to_status,created_at) VALUES($1,$2,'evolucao',$3,'aberto',$4,$5)",[id,group[1],status==='resolvido'||status==='encerrado'?'Serviço simulado concluído e validado; aguardando encerramento quando aplicável.':'Equipe fictícia registrou a situação inicial do serviço.',status,'2026-10-11T14:30:00Z']);
   await db.query("INSERT INTO ticket_events(ticket_id,actor_id,kind,content,created_at) VALUES($1,$2,'comentario','Acompanhamento registrado pela supervisão fictícia.',$3)",[id,group[2],'2026-10-11T15:00:00Z']);
  }
 }
 await db.query("SELECT setval(pg_get_serial_sequence('tickets','id'),GREATEST((SELECT max(id) FROM tickets),2300))");
 await db.query("INSERT INTO ticket_grants(ticket_id,user_id,granted_by) VALUES(2233,'gabriela','henrique') ON CONFLICT DO NOTHING");
 await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
if(process.argv[1]?.endsWith('db-setup.ts')) {await setupDatabase();console.log('Migração e seeds aplicados sem substituir dados existentes.');await closePools();}
