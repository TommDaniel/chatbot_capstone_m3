import pg from 'pg';
import { config } from './config.js';
export const pool = new pg.Pool({connectionString:config.databaseUrl,max:10});
export const ownerPool = new pg.Pool({connectionString:config.ownerUrl,max:3});
export async function withUser<T>(userId:string,fn:(db:pg.PoolClient)=>Promise<T>):Promise<T> {
 const db=await pool.connect();
 try {await db.query('BEGIN');await db.query("SELECT set_config('app.user_id',$1,true)",[userId]);const value=await fn(db);await db.query('COMMIT');return value;}
 catch(e){await db.query('ROLLBACK');throw e;} finally{db.release();}
}
export async function closePools(){await Promise.all([pool.end(),ownerPool.end()]);}
