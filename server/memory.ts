import {withUser} from './db.js';
import type {PromptMessage} from './context.js';
export async function loadMemory(userId:string){return withUser(userId,async db=>{const row=(await db.query('SELECT * FROM user_memory WHERE user_id=$1',[userId])).rows[0];const raw:number[]=row?.recent_ticket_ids??[];const allowed:number[]=[];for(const id of raw)if((await db.query('SELECT can_read_ticket($1) allowed',[id])).rows[0].allowed)allowed.push(id);return{preferences:row?.preferences??{style:'curto'},recentTicketIds:allowed,hadRevokedReference:allowed.length<raw.length};});}
export async function rememberTickets(userId:string,ids:number[]){await withUser(userId,async db=>{const current=(await db.query('SELECT recent_ticket_ids FROM user_memory WHERE user_id=$1',[userId])).rows[0]?.recent_ticket_ids??[];const next=[...new Set([...ids,...current])].slice(0,5);await db.query('INSERT INTO user_memory(user_id,recent_ticket_ids) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET recent_ticket_ids=excluded.recent_ticket_ids',[userId,next]);});}
export async function loadHistory(userId:string,conversationId:string):Promise<PromptMessage[]>{return withUser(userId,async db=>{
 const rows=(await db.query('SELECT role,content FROM (SELECT role,content,created_at,id FROM messages WHERE conversation_id=$1 ORDER BY created_at DESC,id DESC LIMIT 12) recent ORDER BY created_at,id',[conversationId])).rows;
 return rows.map(r=>({role:r.role,content:r.content}));
});}
