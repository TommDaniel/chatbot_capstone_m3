import {buildApp} from './app.js';
import {config} from './config.js';
import {indexPendingTickets} from './knowledge.js';
import {closePools} from './db.js';
const app=await buildApp();
await app.listen({port:config.port,host:config.host});
console.log(`Fluxsus AI Lab: http://${config.host}:${config.port}; geração ${config.key?'DeepSeek configurada':'pendente de chave'}`);
const timer=setInterval(()=>{void indexPendingTickets().catch(e=>console.error('Indexação pendente',e.name));},5000);timer.unref();
for(const signal of ['SIGTERM','SIGINT'] as const)process.on(signal,async()=>{clearInterval(timer);await app.close();await closePools();process.exit(0);});
