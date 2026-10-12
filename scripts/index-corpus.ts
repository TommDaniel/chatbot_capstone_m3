import {indexCorpus} from '../server/knowledge.js';
import {closePools} from '../server/db.js';
import {prepareModel} from './prepare-model.js';
await prepareModel();
await indexCorpus();console.log('Corpus e tickets atuais indexados com embeddings locais.');await closePools();
