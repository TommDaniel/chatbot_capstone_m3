# Decisões finais: dependências e correção de ingestão

## Dependências (registrado antes de atualizar)

O primeiro build Docker sinalizou dez avisos de dependências, incluindo severidades altas e críticas. A auditoria online npm foi rejeitada pela revisão automática por enviar o inventário à registry pública. A alternativa offline não encontrou avisos no cache local, o que não comprova ausência de vulnerabilidades. Sem reenviar o inventário, foram consultados avisos públicos de componentes individuais e sua árvore local.

Decisão: atualizar @fastify/static para 10.1.6, Vitest para 5.0.4 e Transformers.js para 4.3.1, fixar sharp 0.35.5. São mantidos Node24, SDK DeepSeek, o mesmo modelo E5/ONNX de hash validado, o mesmo SQL e as regras de acesso. Reexecutar tipos, unidades, integração com banco, embeddings e E2E depois da atualização. Atualização de dependências não equivale a auditoria completa de segurança.

Fontes públicas primárias: https://github.com/advisories/GHSA-83w8-p2f5-377r (static), https://github.com/advisories/GHSA-85c8-ppgw-ccpr (tinypool), https://github.com/advisories/GHSA-f88m-g3jw-g9cj e https://github.com/advisories/GHSA-wq5f-xc86-pv6w (sharp). O sprintf-js antigo veio da cadeia onnxruntime-node/global-agent/roarr; a árvore será conferida após a atualização.

Após atualizar, a árvore local confirmou static10.1.6, sharp0.35.5 e ausência de sprintf-js/tinypool nas cadeias instaladas. O Dockerfile usa npm ci --no-audit --no-fund, evitando envio automático de inventário em builds futuros. Isso não autoriza alegar auditoria completa nem zero vulnerabilidades no ecossistema.

## Caso eval-08: falha real e correção

A rodada inicial live acertou o rótulo em 29/30 casos RAG (prompting 23/30). No caso 08, a recuperação trouxe apenas o cabeçalho/licença do OWASP, sem a seção Change Password Feature; o modelo corretamente se absteve. A métrica automática por ID de documento registrou 5/5 nessa execução inicial, embora não houvesse trecho útil. A leitura qualitativa daquele incidente tratou a relevância como nula para aquela resposta sem chunk útil; essa observação não descreve a resposta final. Na regressão corrigida, eval-08 recuperou a seção Change Password e também um chunk de Logging and Monitoring; a revisão por chunk v2 atribuiu relevância 3/5 ao caso final por haver evidência correta junto de ruído.

Decisão: separar preparação documental de conteúdo recuperável. Manter arquivo completo, licença, data, hash e referências no manifesto; indexar apenas seções a partir do primeiro heading nível2. Incluir título da fonte no texto usado para embedding de cada seção (contextualização local, sem chamada paga e sem traduzir/fabricar conteúdo). Versão de algoritmo entra no hash de ingestão para reindexar idempotentemente documentos ao mudar a preparação. Origem e conteúdo exibido das fontes permanecem preservados.

Limiar .85 continua congelado; não reajustar por resultado de holdout. Nova execução dos mesmos 30 casos será identificada como regressão após correção, não como teste independente. Preservar output/evaluation-live-initial.json e documentar diferenças; não apagar ou reclassificar a falha inicial.

A primeira regressão com título em todos os embeddings corrigiu eval-08, porém diminuiu a similaridade da seção de estados de um manual português (eval-03). Foi preservada em output/evaluation-live-title-initial.json. A contextualização por título foi limitada às referências públicas inglesas; manuais portugueses conservam o embedding do texto da seção. A versão final indexa apenas seções do corpo público/fictício, com título de seção retido e contexto de título aplicado somente aos documentos públicos em inglês. Essa preparação corrigiu ambos os casos na regressão repetida, que terminou com RAG 30/30 e prompting 23/30 em igualdade de rótulo. Trata-se dos mesmos casos de holdout executados novamente, não de validação independente. A revisão qualitativa assistida identificou eval-07 como fonte suficiente (uma seção já cobre role, acesso e ação de encerramento), embora a métrica automática tenha dado 2,5/5 por esperar dois documentos. Rerun de integração deve ser serial em relação à avaliação, pois ambas simulam concessão/revogação nos mesmos usuários.

## Configuração reproduzível

O threshold calibrado `.85` e os parâmetros reprodutíveis estão em `data/retrieval-config.json`, incluído na imagem Docker independentemente de `output/`. A versão final do hash de conteúdo identifica o procedimento como `sections-public-title-v3` em `server/knowledge.ts`. Variáveis de ambiente podem substituir o limiar explicitamente; valor vazio usa configuração calibrada. Corpus, versão do preparo, modelo, max-chunks, tamanho/overlap e data de calibração ficam identificados.
