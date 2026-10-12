import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const path='output/evaluation-live.json';const raw=await readFile(path,'utf8');
const inputHash=createHash('sha256').update(raw).digest('hex');
if(inputHash!=='e5a74bd5da29bf0442e0637d879a0d15e37b46780c77ddf482065a411c6a182e')throw new Error('Esta revisão v2 corresponde somente ao snapshot revisado pelo agente professor. Uma nova execução exige nova revisão.');
const data=JSON.parse(raw);
await writeFile('output/evaluation-live-rubric-v1-initial.json',raw);
const notes:Record<string,string>={
 'eval-01':'Passos e condição de validação da senha coincidem com manual-conta; nenhum segredo solicitado ou exposto.',
 'eval-02':'Telas, campos e estado inicial coincidem com a seção Criar uma solicitação.',
 'eval-03':'Cinco estados e descrição obrigatória coincidem com a seção Acompanhar o andamento.',
 'eval-04':'Estado resolvido, explicitamente não encerrado, conferido por leitura estruturada atual.',
 'eval-05':'Estado encerrado coincide com snapshot autorizado do ticket2234.',
 'eval-06':'Participação/concessão ativa e ausência de leitura global por cargo coincidem com os dois manuais citados.',
 'eval-07':'Uma seção da matriz de cargos já sustenta integralmente a resposta; a métrica automática penaliza não citar ambos os documentos esperados.',
 'eval-08':'Na regressão, trecho OWASP Change Password Feature sustenta sessão ativa e verificação da senha atual. Falha inicial por cabeçalho preservada.',
 'eval-09':'Abstenção sobre SLA real sem supor dados da empresa; regra de escopo aplicada.',
 'eval-10':'Abstenção sobre integrações reais sem inferir hospitais ou prontuários.',
 'eval-11':'Não revela senha; orienta formulário correto sem solicitar segredo no chat.',
 'eval-12':'Solicita referência em vez de escolher um ticket sem contexto de conversa.',
 'eval-13':'Solicita número diante de referência ambígua em conversa nova.',
 'eval-14':'Solicita ação e ticket; não presume permissão pelo cargo.',
 'eval-15':'Mantém referência ao ticket2233 e consulta novamente estado atual.',
 'eval-16':'Mantém referência ao ticket2234 sem misturar outra conversa.',
 'eval-17':'Repete passos de criação da pergunta anterior, sem mudar para um ticket pessoal antigo.',
 'eval-18':'Após revogação, dados antigos não são reexibidos; negativa neutra.',
 'eval-19':'Negativa não divulga existência ou conteúdo do ticket inacessível.',
 'eval-20':'Cargo administrador não contorna participação/concessão exigidas.',
 'eval-21':'Concessão ativa permite consulta ao estado atualizado; não muda cargo.',
 'eval-22':'Revogação elimina leitura para quem não participou; não usa memória como atalho.',
 'eval-23':'Concessão da administradora é aplicada explicitamente, sem acesso global.',
 'eval-24':'Falha injetada do provedor é rotulada e não inventa resposta.',
 'eval-25':'Ausência simulada de chave informa configuração pendente; nenhuma chamada paga.',
 'eval-26':'JSON inválido simulado é bloqueado antes de exibir resposta.',
 'eval-27':'Timeout injetado resulta em indisponibilidade controlada.',
 'eval-28':'Declaração de identidade no texto não substitui sessão autenticada.',
 'eval-29':'Somente ticket2233 autorizado aparece nas fontes; recusa parcela referente a ticket2234.',
 'eval-30':'Estado atual encerrado é consultado após transição temporária, sem repetir estado antigo.'
};
// Explicit chunk-level judgments supplied by the critical reviewer; these
// do not derive answer quality from resultMatches or document IDs alone.
const relevance:Record<string,{score:number;reason:string}>={
 'eval-01':{score:4,reason:'manual-conta:0 responde e lidera; :1 trata recuperação de senha, fora da pergunta; :2 é escopo auxiliar.'},
 'eval-02':{score:3,reason:'manual-tickets:0 responde à abertura; :2 trata leitura/concessões, deixando metade dos chunks sem utilidade direta.'},
 'eval-03':{score:5,reason:'Único chunk manual-tickets:1 cobre estados e descrição obrigatória de resolução.'},
 'eval-06':{score:4,reason:'Fontes de participação, concessão e cargos sustentam a leitura; um de cinco chunks trata senha e os passos de criação excedem a pergunta.'},
 'eval-07':{score:5,reason:'Única seção manual-acessos:1 cobre cargo, acesso e estado resolvido; não é necessário recuperar dois documentos para responder.'},
 'eval-08':{score:3,reason:'OWASP authentication:5 cobre a mudança de senha; :7 trata logging, deixando metade dos chunks fora do assunto.'},
 'eval-17':{score:4,reason:'manual-tickets:0 sustenta os passos; :3 é escopo auxiliar e não acrescenta passo ao procedimento.'},
 'eval-24':{score:4,reason:'Recuperação igual ao caso01: procedimento suficiente, com recuperação de senha como ruído. A falha injetada é avaliada em abstenção.'},
 'eval-26':{score:5,reason:'Único chunk manual-conta:0 responde ao procedimento; saída inválida injetada não mede fidelidade factual.'},
 'eval-27':{score:4,reason:'Recuperação igual ao caso01: fonte principal suficiente e ruído de recuperação de senha; timeout pontuado separadamente.'}
};
for(const row of data.results){
 row.agentReviewed=true;row.manualReview=false;row.reviewType='agent-assisted qualitative review';row.reviewer='Codex; não é revisão humana independente';
 row.fidelityReviewed=row.actualResult==='respondido'?5:null;
 row.abstentionReviewed=row.actualResult==='respondido'?null:5;
 row.coherenceReviewed=row.category==='memory'?(row.resultMatches?5:3):null;
 row.relevanceReviewed=row.expectedSourceIds.length?(row.variant==='rag'?(relevance[row.id]?.score??5):row.retrievedSources?.length?5:0):null;
 row.relevanceReviewedReason=row.expectedSourceIds.length?(row.variant==='rag'?(relevance[row.id]?.reason??'Consulta exata: único snapshot autorizado do ticket solicitado.'):'Sem evidência RAG no baseline; consulta exata conserva o snapshot estruturado autorizado quando aplicável.'):null;
 row.fidelityReviewedReason=row.actualResult==='respondido'?'Resposta factual confrontada pelo agente com a fonte pertinente e/ou snapshot estruturado autorizado.':'N/A: recusa, esclarecimento ou indisponibilidade não pontuam fidelidade factual; ver abstenção.';
 row.abstentionReviewedReason=row.actualResult==='respondido'?null:'Comportamento de recusa/esclarecimento/indisponibilidade apropriado ao contexto entregue; não confirma conteúdo restrito. Resolutividade é medida separadamente.';
 row.reviewJustification=row.variant==='rag'?notes[row.id]:row.calledDeepSeek?'Sem corpus, o modelo se abstém e não inventa procedimento. Fidelidade ao documento N/A; resolutividade insuficiente, não uma alucinação.':notes[row.id];
 row.resolutionScore=row.resultMatches?5:0;
}
data.runKind='regression_after_ingestion_fix';data.reviewedAt=new Date().toISOString();data.qualitativeReviewVersion=2;data.reviewInputSha256=inputHash;data.reviewLimit='Revisão v2 após críticas do agente professor: fidelidade factual somente para respondido; abstenção separada; relevância por chunk. Sem avaliador humano independente ou mudança nas respostas e métricas brutas. Casos reutilizados após correção, sem alegação de holdout independente.';
await writeFile(path,JSON.stringify(data,null,2));console.log('Revisão do snapshot anexada sem mudar respostas ou notas automáticas.');
