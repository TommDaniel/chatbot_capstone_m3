import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {ownerPool,withUser} from './db.js';
import {chunkText,embed,vectorLiteral} from './embeddings.js';
import {ticketSource} from './tickets.js';
import type {Source} from '../shared/types.js';
import {config} from './config.js';
type Manifest={id:string;title:string;kind:'manual'|'publico';file:string;language:string;url?:string;license:string;version:string};
export async function indexCorpus(){
 const manifest=JSON.parse(await readFile(new URL('../data/corpus/manifest.json',import.meta.url),'utf8')) as Manifest[];
 for(const doc of manifest){
  const content=await readFile(new URL(`../data/corpus/${doc.file}`,import.meta.url),'utf8');const hash=createHash('sha256').update('sections-public-title-v3\n'+content).digest('hex');
  const previous=(await ownerPool.query('SELECT version,content_hash FROM documents WHERE id=$1',[doc.id])).rows[0];
  if(previous?.content_hash===hash)continue;
  const body=content.replace(/^[\s\S]*?(?=^## )/m,'');
  const version=(previous?.version??0)+1;const parts=await chunkText(body);const vectors=[];for(const part of parts)vectors.push(await embed(doc.kind==='publico'?`${doc.title}\n${part}`:part,'passage'));
  const db=await ownerPool.connect();try{await db.query('BEGIN');await db.query('INSERT INTO documents(id,title,kind,file,language,url,license,version,content_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO UPDATE SET title=excluded.title,version=excluded.version,content_hash=excluded.content_hash,url=excluded.url',[doc.id,doc.title,doc.kind,doc.file,doc.language,doc.url??null,doc.license,version,hash]);
   await db.query('DELETE FROM chunks WHERE document_id=$1',[doc.id]);
   for(let i=0;i<parts.length;i++)await db.query('INSERT INTO chunks(id,document_id,title,kind,version,content,embedding) VALUES($1,$2,$3,$4,$5,$6,$7::vector)',[`${doc.id}:v${version}:${i}`,doc.id,doc.title,doc.kind,version,parts[i],vectorLiteral(vectors[i])]);await db.query('COMMIT');
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }
 await indexPendingTickets();
}
let indexing:Promise<void>|undefined;
export function indexPendingTickets(){return indexing??=(async()=>{
 const pending=(await ownerPool.query("SELECT t.* FROM tickets t WHERE NOT EXISTS(SELECT 1 FROM chunks c WHERE c.ticket_id=t.id AND c.version=t.version) ORDER BY t.id")).rows;
 for(const ticket of pending){
  const events=(await ownerPool.query('SELECT e.*,u.name actor_name FROM ticket_events e JOIN users u ON u.id=e.actor_id WHERE ticket_id=$1 ORDER BY e.created_at,e.id',[ticket.id])).rows;
  const texts=[`Ticket #${ticket.id}. Título: ${ticket.title}. Descrição: ${ticket.description}. Estado atual: ${ticket.status}. Categoria: ${ticket.category}. Prioridade: ${ticket.priority}. Versão: ${ticket.version}. Atualizado em: ${new Date(ticket.updated_at).toISOString()}.`,...events.map(e=>`Ticket #${ticket.id}: ${ticket.title}. Evento ${e.id} em ${new Date(e.created_at).toISOString()}: ${e.actor_name}. ${e.content} ${e.to_status?`Estado registrado nesse evento: ${e.to_status}.`:''} Estado atual: ${ticket.status}.`)];
  const parts:string[]=[];for(const text of texts)parts.push(...await chunkText(text));const vectors=[];for(const part of parts)vectors.push(await embed(part,'passage'));
  const db=await ownerPool.connect();try{await db.query('BEGIN');const current=(await db.query('SELECT version FROM tickets WHERE id=$1 FOR UPDATE',[ticket.id])).rows[0];
   if(current?.version!==ticket.version){await db.query('ROLLBACK');continue;}
   await db.query('DELETE FROM chunks WHERE ticket_id=$1',[ticket.id]);
   for(let i=0;i<parts.length;i++)await db.query('INSERT INTO chunks(id,document_id,title,kind,ticket_id,version,content,embedding) VALUES($1,$2,$3,\'ticket\',$4,$5,$6,$7::vector)',[`ticket:${ticket.id}:v${ticket.version}:${i}`,`ticket:${ticket.id}`,`Ticket #${ticket.id}: ${ticket.title}`,ticket.id,ticket.version,parts[i],vectorLiteral(vectors[i])]);await db.query('COMMIT');
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }
})().finally(()=>{indexing=undefined;});}
function mapSource(r:Record<string,any>):Source{return{id:r.id,documentId:r.document_id,title:r.title,kind:r.kind,ticketId:r.ticket_id??undefined,version:r.version,excerpt:r.content,url:r.url??undefined,score:Number(r.similarity)};}
export function candidateDocuments(question:string):string[]{
 const q=question.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 if(/owasp/.test(q)){
  if(/autoriz|permiss|privileg|acesso/.test(q))return['owasp-authorization'];
  if(/cookie|sessao|javascript|script/.test(q))return['owasp-session-management'];
  if(/senha|autentic|identidade/.test(q))return['owasp-authentication'];
  return['owasp-authentication','owasp-authorization','owasp-session-management'];
 }
 const docs:string[]=[];
 if(/senha|conta|login|e-mail|email|autentic/.test(q))docs.push('manual-conta');
 if(/cargo|permiss|acesso|particip|concess/.test(q))docs.push('manual-acessos');
 if(/crio|criar|cria[cç]ao|abro|abrir|abre|andamento|estados|resolver|resolve|encerrar|encerra|solicita[cç]ao/.test(q))docs.push('manual-tickets');
 return docs;
}
export async function retrieve(userId:string,question:string,threshold=config.threshold):Promise<Source[]>{
 const vector=vectorLiteral(await embed(question));
 return withUser(userId,async db=>{
  // ACL and current version predicates are applied before both candidate rankings.
  const args=[vector,question,threshold,candidateDocuments(question)];
  const rows=(await db.query(`WITH eligible AS MATERIALIZED (
    SELECT c.*,d.url,1-(c.embedding <=> $1::vector) similarity,ts_rank_cd(c.search_vector,websearch_to_tsquery('portuguese',$2)) lexical
    FROM chunks c LEFT JOIN documents d ON d.id=c.document_id
    WHERE (cardinality($4::text[])=0 OR c.document_id=ANY($4::text[])) AND (c.ticket_id IS NULL OR can_read_ticket(c.ticket_id)) AND
     (c.ticket_id IS NULL OR c.version=(SELECT t.version FROM tickets t WHERE t.id=c.ticket_id))
   ), semantic AS (SELECT id,row_number() OVER(ORDER BY similarity DESC,id) rank FROM eligible WHERE similarity >= $3 ORDER BY similarity DESC,id LIMIT 20),
   lexical AS (SELECT id,row_number() OVER(ORDER BY lexical DESC,id) rank FROM eligible WHERE lexical>0 AND similarity >= $3 ORDER BY lexical DESC,id LIMIT 20)
   SELECT e.*,coalesce(1.0/(60+s.rank),0)+coalesce(1.0/(60+l.rank),0) rrf FROM eligible e LEFT JOIN semantic s USING(id) LEFT JOIN lexical l USING(id)
   WHERE s.id IS NOT NULL OR l.id IS NOT NULL ORDER BY rrf DESC,similarity DESC,id LIMIT 5`,args)).rows;
  return rows.map(mapSource);
 });
}
export async function getSource(userId:string,id:string){return withUser(userId,async db=>{const match=/^ticket:(\d+)$/.exec(id);if(match)return ticketSource(db,Number(match[1]));
 const row=(await db.query('SELECT c.*,d.url FROM chunks c LEFT JOIN documents d ON d.id=c.document_id WHERE c.id=$1 AND (c.ticket_id IS NULL OR can_read_ticket(c.ticket_id)) AND (c.ticket_id IS NULL OR c.version=(SELECT version FROM tickets WHERE id=c.ticket_id))',[id])).rows[0];return row?mapSource(row):null;});}
