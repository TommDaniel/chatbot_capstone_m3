import OpenAI from 'openai';
import {config} from '../server/config.js';
if(!config.key)throw new Error('Chave não configurada.');
try{const client=new OpenAI({apiKey:config.key,baseURL:config.baseUrl,timeout:15000,maxRetries:0});const models=await client.models.list();console.log(JSON.stringify({configured:true,requestedModel:config.model,availableModels:models.data.map(m=>m.id),supported:models.data.some(m=>m.id===config.model)}));}
catch(e){console.log(JSON.stringify({configured:true,status:e instanceof OpenAI.APIError?e.status:null,check:'provider_unavailable'}));process.exitCode=1;}
