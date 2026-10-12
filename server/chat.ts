import {randomUUID} from 'node:crypto';
import {withUser} from './db.js';
import {ticketSource} from './tickets.js';
import {retrieve,getSource} from './knowledge.js';
import {loadMemory,loadHistory,rememberTickets} from './memory.js';
import {buildContext,conservativeTokens} from './context.js';
import {DeepSeekGenerator,validateGeneration,type Generator} from './generation.js';
import {HttpError,hiddenTicket} from './security.js';
import type {User,Source,Result,ChatResponse} from '../shared/types.js';
export const parseTicketIds=(q:string)=>[...new Set([...q.matchAll(/(?:ticket\s*#?\s*|chamado\s*#?\s*|#)(\d{1,9})|\b(\d{3,9})#/gi)].map(m=>Number(m[1]??m[2])))];
export type ChatTrace={retrievedSources?:Source[];generated?:boolean;validationFailure?:string;estimatedInputTokens?:number;historyMessages?:number};
export async function answerChat(user:User,input:{message:string;conversationId?:string},generator?:Generator,mode:'rag'|'prompting'='rag',trace:ChatTrace={}):Promise<ChatResponse>{
 const requestId=randomUUID();const conversationId=input.conversationId??randomUUID();
 await withUser(user.id,async db=>{if(input.conversationId){if(!(await db.query('SELECT 1 FROM conversations WHERE id=$1',[conversationId])).rowCount)throw new HttpError(404,'Conversa não disponível.');}else await db.query('INSERT INTO conversations(id,user_id) VALUES($1,$2)',[conversationId,user.id]);});
 const history=await loadHistory(user.id,conversationId);const memory=await loadMemory(user.id);
 const hiddenHistory=await withUser(user.id,async db=>(await db.query('SELECT conversation_hidden_context($1) hidden',[conversationId])).rows[0].hidden);
 const originalIds=parseTicketIds(input.message);let ids=[...originalIds];
 const followUp=/\b(ele|ela|esse|essa|aquele|aquela|dele|dela|repita|anterior|procedimento|isso)\b|como você sabe/i.test(input.message);
 const previousQuestion=[...history].reverse().find(m=>m.role==='user')?.content;
 const ticketFollowUp=/\b(ele|ela|esse|essa|aquele|aquela|dele|dela|ticket|chamado)\b|como você sabe/i.test(input.message)&&!/procedimento|repita.*passos|senha|conta|permiss[aã]o/i.test(input.message);
 if(!ids.length&&followUp&&ticketFollowUp){
  const lastReference=[...history].reverse().find(m=>parseTicketIds(m.content).length>0);
  ids=parseTicketIds(lastReference?.content??'');
 }
 if(!ids.length&&/último ticket|ultimo ticket|ticket recente/i.test(input.message))ids=memory.recentTicketIds.slice(0,1);
 let sources:Source[]=[];let answer='';let result:Result='sem_evidencia';
 const exact = ids.length>0;
 if(exact){
  let denied=false;for(const id of ids){const source=await withUser(user.id,db=>ticketSource(db,id));if(source)sources.push(source);else denied=true;}
  trace.retrievedSources=[...sources];
  if(sources.length){result='respondido';answer=sources.map(s=>memory.preferences.style==='detalhado'||/hist[oó]r|resum|detalh|conte[uú]do|descri|quem|trabalh/i.test(input.message)?s.excerpt:`${s.title}\n${/Estado atual:.*$/m.exec(s.excerpt)?.[0]??''}\n${/Atualizado em:.*$/m.exec(s.excerpt)?.[0]??/Atualizado em:\s*[^\n]+/.exec(s.excerpt)?.[0]??''}`).join('\n\n');if(denied)answer+='\n\nNão consigo confirmar informações de outros tickets no seu acesso atual.';}
  else answer=hiddenTicket;
 }else if(/qual (?:é )?(?:a )?(?:minha|sua) senha|revele.*(?:senha|chave)|chave.*api|dump.*banco/i.test(input.message)){
  answer='Não posso consultar ou revelar senhas ou chaves. Use o formulário de alteração de senha em Minha conta.';
 }else if(/SLA real|empresa real|plataforma real|com quais hospitais|prontu[aá]rios|diagn[oó]stico|prescri[çc][aã]o/i.test(input.message)){
  answer='Essa informação não consta na base deste protótipo. Só disponho de documentos públicos e registros fictícios.';
 }else if(followUp&&ticketFollowUp&&hiddenHistory&&!ids.length){answer=hiddenTicket;
 }else if((/\b(ele|ela|aquele|aquela|esse chamado)\b/i.test(input.message)&&!previousQuestion)||/essa permiss[aã]o/i.test(input.message)){
  result='ambiguo';answer='Qual ticket (número) e qual ação você quer consultar?';
 }else{
  const query=followUp&&previousQuestion?`${previousQuestion}\n${input.message}`:input.message;
  try{if(mode==='rag')sources=await retrieve(user.id,query);}catch{result='indisponivel';answer='A consulta ao conhecimento está indisponível. Tente novamente.';}
  trace.retrievedSources=[...sources];
  if(!answer){
   const llm=generator??new DeepSeekGenerator(user.id);
   if(!llm.configured){result='indisponivel';answer='A configuração da API ainda está pendente. Preencha DEEPSEEK_API_KEY no .env e reinicie a aplicação.';sources=[];}
   else if(mode==='rag'&&!sources.length){answer='Não encontrei informações suficientes na base para responder com segurança.';}
   else{
    try{
     // Trim whole evidence chunks before constructing context; do not leak oversized raw streams.
     while(sources.length&&conservativeTokens(JSON.stringify(sources))+conservativeTokens(input.message)>5700)sources.pop();
     const prompt=buildContext(user,input.message,sources,history,memory.preferences.style,sources.some(s=>s.kind==='ticket')?memory.recentTicketIds:[]);
     trace.estimatedInputTokens=prompt.reduce((n,m)=>n+conservativeTokens(m.content),0);trace.historyMessages=prompt.length-2;trace.generated=true;
     const validated=validateGeneration(await llm.generate(prompt),sources);
     answer=validated.answer;sources=validated.sources;result=validated.abstain?'sem_evidencia':'respondido';
    }catch(error){trace.validationFailure=(error as Error).message;result='indisponivel';answer='A resposta está indisponível no momento. Tente novamente; nenhuma resposta não validada foi exibida.';}
   }
  }
 }
 // Revalidate authorization and version after generation, before saving or delivering any source/text.
 for(const source of sources){const current=await getSource(user.id,source.id);if(!current||(source.ticketId&&current.version!==source.version)){sources=[];answer='O acesso ou o registro mudou durante a consulta. Faça a pergunta novamente para consultar os dados atuais.';result='sem_evidencia';break;}}
 const refs=[...new Set(sources.flatMap(s=>s.ticketId?[s.ticketId]:[]))];
 const storedQuestion=originalIds.some(id=>!refs.includes(id))?'Consulta com referência fora do acesso atual; conteúdo da pergunta omitido.':input.message;
 const messageId=randomUUID();
 await withUser(user.id,async db=>{
  if(!(await db.query('SELECT app_role() role')).rows[0].role)throw new HttpError(401,'Sessão não disponível.');
  await db.query('INSERT INTO messages(id,conversation_id,user_id,role,content,ticket_ids,created_at) VALUES($1,$2,$3,\'user\',$4,$5,clock_timestamp())',[randomUUID(),conversationId,user.id,storedQuestion,refs]);
  await db.query('INSERT INTO messages(id,conversation_id,user_id,role,content,result,sources,ticket_ids,created_at) VALUES($1,$2,$3,\'assistant\',$4,$5,$6,$7,clock_timestamp())',[messageId,conversationId,user.id,answer,result,JSON.stringify(sources),refs]);
  await db.query('INSERT INTO audit_log(user_id,request_id,action,metadata) VALUES($1,$2,\'chat\',$3)',[user.id,requestId,JSON.stringify({result,sourceCount:sources.length,mode})]);
 });
 if(sources.some(s=>s.ticketId))await rememberTickets(user.id,sources.flatMap(s=>s.ticketId?[s.ticketId]:[]));
 return{conversationId,messageId,answer,result,sources,requestId};
}
