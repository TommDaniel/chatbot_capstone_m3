import type pg from 'pg';
import type {Ticket,Source} from '../shared/types.js';
export function mapTicket(r:Record<string,any>):Ticket {return{id:r.id,title:r.title,description:r.description,category:r.category,priority:r.priority,status:r.status,version:r.version,createdAt:new Date(r.created_at).toISOString(),updatedAt:new Date(r.updated_at).toISOString()};}
export async function ticketSource(db:pg.PoolClient,id:number):Promise<Source|null>{
 const row=(await db.query('SELECT * FROM tickets WHERE id=$1 AND can_read_ticket(id)',[id])).rows[0];if(!row)return null;
 const events=(await db.query('SELECT e.*,u.name actor_name FROM ticket_events e JOIN users u ON u.id=e.actor_id WHERE ticket_id=$1 ORDER BY e.created_at,e.id',[id])).rows;
 const label=row.status.replaceAll('_',' ');const ended=row.status==='encerrado'?'encerrado':'não encerrado';
 return{id:`ticket:${id}`,documentId:`ticket:${id}`,title:`Ticket #${id}: ${row.title}`,kind:'ticket',ticketId:id,version:row.version,
 excerpt:`Ticket #${id}\nTítulo: ${row.title}\nDescrição: ${row.description}\nEstado atual: ${label} (${ended}).\nVersão: ${row.version}. Atualizado em: ${new Date(row.updated_at).toISOString()}\nHistórico registrado:\n${events.map(e=>`${new Date(e.created_at).toISOString()} - ${e.actor_name}: ${e.content}${e.to_status?` Estado registrado: ${e.to_status}.`:''}`).join('\n')}`};
}
