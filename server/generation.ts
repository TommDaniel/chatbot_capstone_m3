import OpenAI from 'openai';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {config} from './config.js';
import {withUser} from './db.js';
import {conservativeTokens,type PromptMessage} from './context.js';
import type {Source} from '../shared/types.js';
export interface Generator {configured:boolean;generate(messages:PromptMessage[]):Promise<string>}
export class DeepSeekGenerator implements Generator {
 configured=Boolean(config.key);constructor(private userId:string){}
 async generate(messages:PromptMessage[]){
  if(!this.configured)throw new Error('missing_key');
  const client=new OpenAI({apiKey:config.key,baseURL:config.baseUrl,timeout:config.timeout,maxRetries:0});
  for(let attempt=0;attempt<2;attempt++){
   const id=randomUUID();const reserved=(messages.reduce((n,m)=>n+conservativeTokens(m.content),0)*config.inputPrice+1024*config.outputPrice)/1e6;
   const allowed=await withUser(this.userId,async db=>(await db.query('SELECT reserve_generation($1,$2,$3,$4,$5) allowed',[id,config.model,reserved,config.budget,config.maxCalls])).rows[0].allowed);
   if(!allowed)throw new Error('budget_exceeded');
   try {
    const response=await client.chat.completions.create({model:config.model,messages,temperature:.1,max_tokens:1024,response_format:{type:'json_object'},...{thinking:{type:'disabled'}}});
    const usage=response.usage;const actual=usage?((usage.prompt_tokens*config.inputPrice+usage.completion_tokens*config.outputPrice)/1e6):reserved;
    await withUser(this.userId,db=>db.query("UPDATE llm_usage SET actual_cost=$2,input_tokens=$3,output_tokens=$4,status='completed' WHERE id=$1",[id,actual,usage?.prompt_tokens??null,usage?.completion_tokens??null]));
    return response.choices[0]?.message.content??'';
   }catch(error){
    await withUser(this.userId,db=>db.query("UPDATE llm_usage SET status='failed' WHERE id=$1",[id]));
    if(attempt===0&&error instanceof OpenAI.APIError&&(error.status===429||(error.status??0)>=500)){await new Promise(r=>setTimeout(r,500));continue;}throw error;
   }
  }throw new Error('provider_error');
 }
}
const generatedSchema=z.object({answer:z.string().min(1).max(6000),sourceIds:z.array(z.string()).max(5),abstain:z.boolean()}).strict();
export function validateGeneration(raw:string,sources:Source[]){
 const parsed=generatedSchema.parse(JSON.parse(raw));
 if(parsed.sourceIds.some(id=>!sources.some(s=>s.id===id)))throw new Error('Citação não recuperada');
 if(!parsed.abstain&&!parsed.sourceIds.length)throw new Error('Resposta factual sem evidência');
 const cited=sources.filter(s=>parsed.sourceIds.includes(s.id));
 // IDs de tickets adicionais nunca podem ser inventados ou recebidos de memória antiga.
 const mentioned=[...parsed.answer.matchAll(/(?:ticket\s*#?\s*|#)(\d+)/gi)].map(m=>Number(m[1]));
 if(mentioned.some(id=>!cited.some(s=>s.ticketId===id)))throw new Error('Ticket sem evidência');
 const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replaceAll('_',' ').toLowerCase();
 const ticketSources=cited.filter(s=>s.kind==='ticket');
 for(const source of ticketSources){
  const current=/Estado atual:\s*(aberto|em_andamento|em andamento|aguardando|resolvido|encerrado)/i.exec(source.excerpt)?.[1];
  if(!current)continue;
  const relevant=ticketSources.length===1?parsed.answer:parsed.answer.split(/(?<=[.!?])\s+|\n/).filter(s=>new RegExp(`(?:ticket\\s*#?\\s*|#)${source.ticketId}\\b`,'i').test(s)).join('\n');
  for(const sentence of normalize(relevant).split(/[.!?\n]/)){
   if(!/\b(esta|estado atual|status atual|atualmente|continua|foi encerrado|ja encerrou)\b/.test(sentence))continue;
   const positive=sentence.replace(/nao\s+(?:(?:esta|foi|e|ainda|sido)\s+){0,3}(aberto|em andamento|aguardando|resolvido|encerrado)/g,'');
   const asserted=[...positive.matchAll(/\b(aberto|em andamento|aguardando|resolvido|encerrado)\b/g)].map(m=>m[1]);
   if(asserted.some(status=>status!==normalize(current)))throw new Error('Estado incompatível com registro atual');
  }
  const dates=[...source.excerpt.matchAll(/\b(\d{4}-\d{2}-\d{2})/g)].map(m=>m[1]);
  for(const match of relevant.matchAll(/\b(\d{4}-\d{2}-\d{2})|\b(\d{2})\/(\d{2})\/(\d{4})\b/g)){
   const value=match[1]??`${match[4]}-${match[3]}-${match[2]}`;
   if(!dates.includes(value))throw new Error('Data sem evidência no registro');
  }
  const updated=/Atualizado em:\s*(\d{4}-\d{2}-\d{2})/i.exec(source.excerpt)?.[1];
  const claimedUpdate=/atualizad[oa]\s+em\s+(\d{4}-\d{2}-\d{2})/i.exec(relevant)?.[1];
  if(updated&&claimedUpdate&&updated!==claimedUpdate)throw new Error('Data de atualização incompatível');
 }
 return{...parsed,sources:cited};
}
