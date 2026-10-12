import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {answerChat,type ChatTrace} from '../server/chat.js';
import {ownerPool,withUser,closePools} from '../server/db.js';
import {config} from '../server/config.js';
import type {Generator} from '../server/generation.js';
import type {User,ChatResponse,Source} from '../shared/types.js';
type Case={id:string;category:string;userEmail:string;question:string;expectedResult:string;expectedSourceIds:string[];expectedTerms:string[];setup?:string;followUps?:string[]};
const live=process.argv.includes('--live');
if(live&&!config.key)throw new Error('Preencha DEEPSEEK_API_KEY no .env antes da avaliação paga.');
const calibration=JSON.parse(await readFile('output/calibration.json','utf8'));config.threshold=calibration.selectedThreshold;
const cases=JSON.parse(await readFile('evaluation/cases.json','utf8')) as Case[];
const collected:any[]=[];const conversations=new Set<string>();
const memorySnapshot=(await ownerPool.query('SELECT * FROM user_memory')).rows;
function normalize(s:string){return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
const fake:Generator={configured:true,async generate(messages){const context=JSON.parse(messages.at(-1)!.content);const evidence=context.evidencias_nao_confiaveis??[];
 return JSON.stringify(evidence.length?{answer:evidence[0].content,sourceIds:[evidence[0].id],abstain:false}:{answer:'Sem evidência no contexto disponibilizado.',sourceIds:[],abstain:true});}};
async function setup(c:Case){
 const uid=c.userEmail.split('@')[0];const before=(await ownerPool.query('SELECT * FROM ticket_grants WHERE ticket_id=2233 AND user_id=$1',[uid])).rows[0];
 const ticket=(await ownerPool.query('SELECT status,version,updated_at FROM tickets WHERE id=2233')).rows[0];let insertedEvent:string|undefined;let preConversation:string|undefined;
 if(c.setup==='grant'||c.setup==='revoke'){
  await withUser('henrique',db=>db.query('INSERT INTO ticket_grants(ticket_id,user_id,granted_by) VALUES(2233,$1,\'henrique\') ON CONFLICT(ticket_id,user_id) DO UPDATE SET active=true',[uid]));
  if(c.setup==='revoke'){
   const user=(await ownerPool.query('SELECT id,name,email,role FROM users WHERE id=$1',[uid])).rows[0] as User;
   const warm=await answerChat(user,{message:'Qual é o estado atual do ticket 2233?'},fake);preConversation=warm.conversationId;conversations.add(preConversation);
   await withUser('henrique',db=>db.query('UPDATE ticket_grants SET active=false WHERE ticket_id=2233 AND user_id=$1',[uid]));
  }
 }
 if(c.setup==='close')await withUser('elisa',async db=>{insertedEvent=(await db.query("INSERT INTO ticket_events(ticket_id,actor_id,kind,content,from_status,to_status) VALUES(2233,'elisa','evolucao','Encerramento fictício temporário para avaliação.','resolvido','encerrado') RETURNING id")).rows[0].id;await db.query("UPDATE tickets SET status='encerrado',version=version+1,updated_at=clock_timestamp() WHERE id=2233");});
 return{preConversation,restore:async()=>{
  if(c.setup==='grant'||c.setup==='revoke'){if(before)await ownerPool.query('UPDATE ticket_grants SET active=$2,granted_by=$3,created_at=$4 WHERE ticket_id=2233 AND user_id=$1',[uid,before.active,before.granted_by,before.created_at]);else await ownerPool.query('DELETE FROM ticket_grants WHERE ticket_id=2233 AND user_id=$1',[uid]);}
  if(insertedEvent){await ownerPool.query('DELETE FROM ticket_events WHERE id=$1',[insertedEvent]);await ownerPool.query('UPDATE tickets SET status=$1,version=$2,updated_at=$3 WHERE id=2233',[ticket.status,ticket.version,ticket.updated_at]);}
 }};
}
try{
 for(const variant of ['prompting','rag'] as const)for(const c of cases){
  const fixture=await setup(c);const start=performance.now();const usageBefore=(await ownerPool.query('SELECT count(*)::int n FROM llm_usage')).rows[0].n;
  let response:ChatResponse|undefined;let error:string|undefined;let generator:Generator|undefined=live?undefined:fake;const trace:ChatTrace={};
  const turns:Array<{question:string;response:ChatResponse;trace:ChatTrace}>=[];
  const simulatedFailure=['provider_error','missing_key','invalid_output','timeout'].includes(c.setup??'');
  if(simulatedFailure)generator={configured:c.setup!=='missing_key',async generate(){if(c.setup==='invalid_output')return '{invalid';throw new Error(c.setup);}};
  try{
   const user=(await ownerPool.query('SELECT id,name,email,role FROM users WHERE email=$1',[c.userEmail])).rows[0] as User;
   response=await answerChat(user,{message:c.question,conversationId:fixture.preConversation},generator,variant,trace);conversations.add(response.conversationId);
   turns.push({question:c.question,response:structuredClone(response),trace:structuredClone(trace)});
   for(const q of c.followUps??[]){response=await answerChat(user,{message:q,conversationId:response.conversationId},generator,variant,trace);turns.push({question:q,response:structuredClone(response),trace:structuredClone(trace)});}
  }catch(e){error=(e as Error).name;}finally{await fixture.restore();}
  const usageAfter=(await ownerPool.query('SELECT count(*)::int n,coalesce(sum(coalesce(actual_cost,reserved_cost)),0)::float cost FROM llm_usage')).rows[0];
  const callUsage=(await ownerPool.query('SELECT coalesce(sum(input_tokens),0)::int input,coalesce(sum(output_tokens),0)::int output,coalesce(sum(coalesce(actual_cost,reserved_cost)),0)::float cost FROM (SELECT * FROM llm_usage ORDER BY created_at DESC LIMIT $1) calls',[usageAfter.n-usageBefore])).rows[0];
  const retrieved=[...new Set((trace.retrievedSources??response?.sources??[]).map(s=>s.documentId??s.id))];const hits=retrieved.filter(id=>c.expectedSourceIds.includes(id)).length;
  const retrieval=c.expectedSourceIds.length?5*hits/c.expectedSourceIds.length:null;
  const termCoverage=c.expectedTerms.length?c.expectedTerms.filter(t=>normalize(response?.answer??'').includes(normalize(t))).length/c.expectedTerms.length:1;
  const correct=response?.result===c.expectedResult;
  collected.push({id:c.id,turns,mode:live?'live':'offline',variant,category:c.category,providerMode:simulatedFailure?'simulated_failure':usageAfter.n>usageBefore?'deepseek':live?'deterministic':'fake_or_deterministic',calledDeepSeek:usageAfter.n>usageBefore,paidCalls:usageAfter.n-usageBefore,model:live?config.model:'test fake',inputTokens:callUsage.input,outputTokens:callUsage.output,estimatedCostUsd:callUsage.cost,question:c.question,followUps:c.followUps,expectedResult:c.expectedResult,actualResult:response?.result??'error',expectedSourceIds:c.expectedSourceIds,retrievedSources:trace.retrievedSources??[],sources:response?.sources??[],answer:response?.answer??'',latencyMs:Math.round(performance.now()-start),metrics:{retrieval,fidelity:correct?Math.round(2+3*termCoverage):0,coherence:c.category==='memory'?(correct?Math.round(2+3*termCoverage):0):null},scoreType:'heuristic',manualReview:false,resultMatches:correct,error,validationFailure:trace.validationFailure,historyMessages:trace.historyMessages,estimatedInputTokens:trace.estimatedInputTokens,cumulativeCostUpperEstimateUsd:usageAfter.cost});
  await mkdir('output',{recursive:true});await writeFile(`output/evaluation-${live?'live':'offline'}.json`,JSON.stringify({createdAt:new Date().toISOString(),mode:live?'live':'offline',runKind:'known_cases_evaluation',model:live?config.model:'test fake',threshold:config.threshold,budgetUsd:config.budget,notes:'Metrics are keyword/result heuristics, not independent human judgment. Exact-ID responses are deterministic. Failure cases deliberately simulate provider faults. eval-17 executes two conversational turns; paidCalls=2 does not imply a retry. Charges estimated conservatively at peak cache-miss rate.',results:collected},null,2));
  console.log(`${variant} ${c.id}: ${response?.result??'error'}; calls=${usageAfter.n-usageBefore}`);
 }
}finally{
 if(conversations.size){await ownerPool.query('DELETE FROM messages WHERE conversation_id=ANY($1::uuid[])',[[...conversations]]);await ownerPool.query('DELETE FROM conversations WHERE id=ANY($1::uuid[])',[[...conversations]]);}
 for(const uid of new Set(cases.map(c=>c.userEmail.split('@')[0]))){const row=memorySnapshot.find(m=>m.user_id===uid);if(row)await ownerPool.query('INSERT INTO user_memory(user_id,preferences,recent_ticket_ids) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET preferences=excluded.preferences,recent_ticket_ids=excluded.recent_ticket_ids',[uid,JSON.stringify(row.preferences),row.recent_ticket_ids]);else await ownerPool.query('DELETE FROM user_memory WHERE user_id=$1',[uid]);}
 await closePools();
}
