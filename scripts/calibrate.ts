import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {retrieve} from '../server/knowledge.js';
import {parseTicketIds} from '../server/chat.js';
import {withUser,closePools} from '../server/db.js';
import {ticketSource} from '../server/tickets.js';
type Case={id:string;question:string;userEmail:string;expectedSourceIds:string[]};
const cases=JSON.parse(await readFile('evaluation/calibration.json','utf8')) as Case[];
const results=[];
for(const threshold of [.75,.80,.85,.90]){
 let tp=0,fp=0,fn=0;const questions=[];
 for(const c of cases){const user=c.userEmail.split('@')[0];const ids=parseTicketIds(c.question);
  const sources=ids.length?await withUser(user,async db=>(await Promise.all(ids.map(id=>ticketSource(db,id)))).filter(x=>x!==null)):
   c.expectedSourceIds.length?await retrieve(user,c.question,threshold):[];
  const found=[...new Set(sources.map(s=>s.documentId??s.id))];const hits=found.filter(id=>c.expectedSourceIds.includes(id)).length;
  tp+=hits;fp+=found.length-hits;fn+=c.expectedSourceIds.length-hits;questions.push({id:c.id,expected:c.expectedSourceIds,retrieved:found,similarities:sources.map(s=>'score' in s?s.score:null)});
 }
 const precision=tp/(tp+fp||1),recall=tp/(tp+fn||1);results.push({threshold,tp,fp,fn,precision,recall,f1:2*precision*recall/(precision+recall||1),questions});
}
results.sort((a,b)=>b.f1-a.f1||b.threshold-a.threshold);const selected=results[0];
await mkdir('output',{recursive:true});await writeFile('output/calibration.json',JSON.stringify({createdAt:new Date().toISOString(),mode:'offline',method:'document-id micro F1; exact lookup included; negative/ambiguous routed without retrieval',selectedThreshold:selected.threshold,results},null,2));
const frozenFile='data/retrieval-config.json';const previous=JSON.parse(await readFile(frozenFile,'utf8'));await writeFile(frozenFile,JSON.stringify({...previous,minSimilarity:selected.threshold,calibratedAt:new Date().toISOString()},null,2));
console.log(JSON.stringify({selectedThreshold:selected.threshold,f1:selected.f1,recall:selected.recall}));await closePools();
