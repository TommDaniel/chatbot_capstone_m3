import 'dotenv/config';
import { resolve } from 'node:path';
import {readFileSync} from 'node:fs';
let calibrated=.80;
try{const value=JSON.parse(readFileSync(resolve('data/retrieval-config.json'),'utf8')).minSimilarity;if([.75,.80,.85,.90].includes(value))calibrated=value;}catch{}
export const config = {
 databaseUrl: process.env.DATABASE_URL ?? 'postgresql://fluxsus_app:fluxsus_local_app_2026@127.0.0.1:55432/fluxsus',
 ownerUrl: process.env.MIGRATION_DATABASE_URL ?? 'postgresql://fluxsus_owner:fluxsus_local_owner_2026@127.0.0.1:55432/fluxsus',
 appPassword: process.env.DB_APP_PASSWORD ?? 'fluxsus_local_app_2026',
 key:process.env.DEEPSEEK_API_KEY ?? '', model:process.env.DEEPSEEK_MODEL ?? 'deepseek-flash',
 baseUrl:process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
 port:Number(process.env.PORT ?? 3001),host:process.env.HOST ?? '127.0.0.1',secureCookie:process.env.COOKIE_SECURE === 'true',
 allowedOrigins:(process.env.ALLOWED_ORIGIN ?? 'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:3001,http://localhost:3001').split(','),
 modelCache:resolve(process.env.EMBEDDING_CACHE ?? '.cache/models'),embeddingModel:process.env.EMBEDDING_MODEL ?? 'Xenova/multilingual-e5-small',
 threshold:Number(process.env.RAG_MIN_SIMILARITY || calibrated),budget:Math.min(1,Number(process.env.LLM_TEST_BUDGET_USD ?? 1)),maxCalls:Math.min(100,Number(process.env.LLM_MAX_CALLS ?? 100)),
 inputPrice:Number(process.env.DEEPSEEK_INPUT_PRICE_PER_MILLION ?? .30), outputPrice:Number(process.env.DEEPSEEK_OUTPUT_PRICE_PER_MILLION ?? 1.20), timeout:Number(process.env.LLM_TIMEOUT_MS ?? 30000)
};
