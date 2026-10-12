import {createReadStream,createWriteStream} from 'node:fs';
import {mkdir,rename,stat,unlink} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {config} from '../server/config.js';
const expected='f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193';
async function digest(file:string){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}
export async function prepareModel(){
 if(config.embeddingModel!=='Xenova/multilingual-e5-small')return;
 const target=resolve(config.modelCache,'Xenova/multilingual-e5-small/onnx/model_quantized.onnx');
 try{if((await stat(target)).size===118308185&&await digest(target)===expected)return;}catch{}
 await mkdir(dirname(target),{recursive:true});const temporary=target+'.download';
 const response=await fetch('https://huggingface.co/Xenova/multilingual-e5-small/resolve/47e7f554d04b0779fbadcc680936cb21826ba3ec/onnx/model_quantized.onnx?download=true');
 if(!response.ok||!response.body)throw new Error('Download do modelo público indisponível');
 await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream),createWriteStream(temporary));
 if(await digest(temporary)!==expected){await unlink(temporary);throw new Error('SHA256 do modelo não corresponde à versão fixada');}
 await rename(temporary,target);
}
if(process.argv[1]?.endsWith('prepare-model.ts')){await prepareModel();console.log('Peso ONNX local verificado por SHA256.');}
