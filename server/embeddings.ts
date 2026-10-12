import { pipeline, AutoTokenizer, env, FeatureExtractionPipeline } from '@huggingface/transformers';
import { config } from './config.js';
env.cacheDir=config.modelCache;
let ready:Promise<void>|undefined;
let extractor:FeatureExtractionPipeline;
let tokenizer:Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>;
const createExtractor=pipeline as unknown as (task:'feature-extraction',model:string,options:{dtype:'q8';device:'cpu'})=>Promise<FeatureExtractionPipeline>;
export function initEmbeddings(){return ready??=(async()=>{tokenizer=await AutoTokenizer.from_pretrained(config.embeddingModel);extractor=await createExtractor('feature-extraction',config.embeddingModel,{dtype:'q8',device:'cpu'});})().catch(error=>{ready=undefined;throw error;});}
export async function embed(text:string,type:'query'|'passage'='query'):Promise<number[]>{await initEmbeddings();const out=await extractor(`${type}: ${text}`,{pooling:'mean',normalize:true});return (out.tolist() as number[][])[0];}
export async function chunkText(text:string,max=320,overlap=48){
 await initEmbeddings();const chunks:string[]=[];
 for(const section of text.split(/(?=^#{1,3} )/m).filter(x=>x.trim())){
  const tokens=tokenizer.encode(section,{add_special_tokens:false});
  for(let start=0;start<tokens.length;start+=max-overlap){chunks.push(tokenizer.decode(tokens.slice(start,start+max),{skip_special_tokens:true}).trim());if(start+max>=tokens.length)break;}
 }return chunks.filter(Boolean);
}
export function vectorLiteral(v:number[]){if(v.length!==384||v.some(x=>!Number.isFinite(x)))throw new Error('Embedding inválido');return `[${v.join(',')}]`;}
