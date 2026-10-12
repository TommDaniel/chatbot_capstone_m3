import { scrypt, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { roles, type Role, type Status } from '../shared/types.js';
const derive=(password:string,salt:string)=>new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,64,{N:131072,r:8,p:1,maxmem:256*1024*1024},(error,key)=>error?reject(error):resolve(key)));
export async function hashPassword(password:string){const salt=randomBytes(16).toString('hex');const key=await derive(password,salt);return `scrypt$131072$${salt}$${key.toString('hex')}`;}
export async function verifyPassword(password:string,stored:string){const [,n,salt,hex]=stored.split('$');if(!salt||!hex||n!=='131072')return false;const key=await derive(password,salt);const expected=Buffer.from(hex,'hex');return key.length===expected.length&&timingSafeEqual(key,expected);}
export function hashToken(token:string){return createHash('sha256').update(token).digest('hex');}
export function atLeast(role:Role,minimum:Role){return roles.indexOf(role)>=roles.indexOf(minimum);}
export const transitions:Record<Status,Status[]>={aberto:['em_andamento'],em_andamento:['aguardando','resolvido'],aguardando:['em_andamento','resolvido'],resolvido:['encerrado'],encerrado:[]};
export function canTransition(role:Role,from:Status,to:Status){return transitions[from].includes(to)&&atLeast(role,to==='encerrado'?'supervisor':'operador');}
export class HttpError extends Error {constructor(public statusCode:number,message:string){super(message);}}
export const hiddenTicket='Não encontrei esse ticket entre os registros que você pode consultar.';
