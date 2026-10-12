# Análise do projeto de exemplo do Módulo 3

**Arquivo analisado:** `C:\Users\danie\Documents\Pos\coders-university-pos-ia-m3-main.zip.zip`, lido por listagem e inspeção dos arquivos TypeScript dentro do ZIP sem extraí-lo nem alterar o original. A análise se refere ao conteúdo que veio no ZIP, não a uma versão remota atualizada.

## O que o exemplo demonstra

O exemplo é um laboratório CLI em TypeScript para estudar chamadas OpenAI, contexto de conversa, embeddings, ingestão de documentos, busca vetorial/híbrida, compressão, validação de saída e alguns utilitários de dados. A composição está espalhada em módulos pequenos de `src/utils/`; esse princípio de decompor pipeline e contexto é reaproveitado.

| Área | Implementação observada no ZIP | O que aprendemos para este projeto |
|---|---|---|
| Entrada | `chatbot.ts` usa `node:readline/promises`; recebe system prompt por argumento, ID de janela opcional e prompt pela consola | A API web deve ser o ponto de entrada autenticado, mas manter pipeline explícita e etapas reconhecíveis |
| Histórico de sessão | `ContextWindow` guarda array em memória; limite default 100 pares (200 mensagens); `MessageRepository` salva role/conteúdo em SQLite local e lê por `context_window` | Distinguir janela enviada ao modelo de armazenamento persistente; no protótipo, também associar user, conversa, fontes e acesso atual |
| Embedding | `embed.ts` chama OpenAI `text-embedding-3-small` usando `OPENAI_API_KEY` | Usar modelo local multilingual E5 para reduzir dependência e custo de indexação, documentando qualidade e latência ainda por medir |
| Vetores | `VectorRepository` usa `node:sqlite`; grava vetor como JSON em tabela simples; busca calcula cosine em Node e pontuação lexical | PostgreSQL/pgvector permite consultar vetor junto a autorização, transação e dados atuais |
| Pontuação híbrida | `hybridScore` combina cosine e termo lexical com peso semântico default 0,7; `keywordScore` é busca por substring simples | Busca lexical ajuda nomes precisos; pesos e threshold precisam de dados de calibração e proteção por usuário |
| Ingestão | `ingest.ts` lê dois TXT; `utils/ingest.ts` corta e gera vetor de cada parte, inserindo um a um | Manifesto de proveniência, fonte versionada e ingestão idempotente eliminam ambiguidade de origem e duplicação |
| Segmentação | `chunkText` corta por caracteres, padrão 500/overlap 100 | Contagem por tokenizer e limite do E5 evitam cortes diferentes por língua/pontuação |
| RAG básico | `ragAnswer` embedda pergunta, busca top-5 por padrão e monta pergunta com chunks para GPT-4o-mini | Separar recuperação, regra e geração; responder a pergunta atual com conteúdo autorizado e IDs de fonte |
| Fallback | `safeRagAnswer` bloqueia sinais literais e retorna abstinência se `results.length === 0` | Lista de palavras não é autorização; usar política por role/participação/concessão e recusa fundada em retrieval |
| Contexto | `maybeCompress` usa estimativa `1 token ≈ 3 caracteres`, threshold 4.096, resume metade mais antiga com LLM; `stitchContext` também pode anexar resumo/perfil | Guardar janela curta por turnos e limite explícito; memória factual de ticket sempre vem de consulta atual |
| Streaming e qualidade | CLI envia fluxo em streaming e valida algumas frases por substring no fim; há `withRetry` com backoff | API web precisa retornar formato de resposta, resultado e fontes validados antes de exibir; retry não pode ultrapassar budget |
| Fine-tuning | `fineTuningData.ts` contém 60 avaliações de sentimento positivo/negativo/neutro e exporta para Parquet via DuckDB | Exemplo ensina o tema, mas dataset de sentimento não serve a chat de tickets e não é formato JSONL de fine-tuning |
| Testes/implantação | `package.json` traz setup de `.env.local` e dependências DuckDB/OpenAI; não há scripts de test, build, DB migração ou web app | A nova entrega acrescenta testes, aplicação, Docker, migration/seed e documentação auditável |

## Caminho real de uma pergunta no exemplo

O comando `src/index.ts` cria `VectorRepository`, executa debug retrieval para pergunta fixa e chama `safeRagAnswer` com a palavra `senha` como sinal proibido. O caminho interativo em `chatbot.ts` carrega mensagens por `windowId`, restaura `ContextWindow`, valida entrada com bloqueios, salva a mensagem do usuário, chama `maybeCompress`, combina a lista com `stitchContext`, envia o system prompt e o histórico a `streamResponse`, filtra a resposta por frases proibidas e salva a mensagem do assistente.

Esse caminho mistura duas modalidades separadas no exemplo. O `chatbot.ts` interativo envia histórico completo/compactado ao modelo, mas não chama `safeRagAnswer` nem injeta chunks do retriever. A amostra RAG está em `index.ts`/`ragAnswer.ts`, como demonstração one-shot separada. O projeto novo conecta explicitamente decisão de intenção, autorização, retriever, montagem de contexto, geração e validação.

## Lacunas que importam para Fluxsus

### Segurança de dados e identidade

O ZIP é processo local de um usuário e não implementa autenticação, role, participação, concessão de acesso, política por linha, sessão de servidor ou filtro de ticket. `windowId` separa uma chave de conversa; não identifica com confiabilidade uma pessoa nem uma permissão. RLS e a identidade autenticada do protótipo são adições necessárias, não funcionalidades preexistentes.

### Retrieval, precisão e proveniência

Tabela vetorial não guarda explicitamente metadata de versão, status atual, permissão nem fonte serializada. A busca lê todos os documentos e calcula scores no cliente do banco; nenhuma condição de ACL antecede o ranking. O algoritmo é útil como demonstração, mas ingestão duplicaria dados a cada repetição e não atualiza versões. O chunk é substring por caractere; a consulta usa busca por substring, sem tokenizer, calibragem ou medição de recall/precision. `ragDebug` imprime trechos ao console.

### Chamada duplicada e custo

Quando `safeRagAnswer` encontra evidência, ele primeiro embeda e busca para verificar não vazio, depois delega a `ragAnswer`, que volta a embeddar e buscar. Isso duplica a operação de retrieval e embeddings por pergunta respondível. No sistema novo, resultado de retrieval deve ser carregado uma vez e compartilhado por pipeline/validador. A configuração original usa `OPENAI_API_KEY`, embeddings `text-embedding-3-small` e geração `gpt-4o-mini`, não DeepSeek.

### Janela e memória

O histórico persistido carrega todas as mensagens para um `windowId`, e a janela de memória limita até 200 mensagens (100 pares) sem orçamento de contexto como fonte de verdade. A estimativa de 3 caracteres/token não usa tokenizer real. A compressão resume metade antiga por uma chamada OpenAI; mensagens originais continuam no DB, e o resumo é inserido na mensagem para aquela requisição, sem ser um registro factual confiável. O system prompt não inclui mecanismos para validar se dados de ticket foram revogados, pois não há mecanismo de acesso.

### Guardas de conteúdo

Os arrays literais de termos/frases funcionam como demonstração de validação, mas não implementam autorização ou detecção ampla de alucinação. Um bloqueio por substring pode recusar uma pergunta legítima sobre troca de senha ou ser contornado por capitalização, variação ou paráfrase. Validar apenas algumas frases “advice-like” em resposta não prova fidelidade ao documento. O novo produto valida em primeiro lugar usuário, recurso, versão e fonte, e deixa o modelo no papel de redação.

## Elementos reaproveitados e mudanças

| Conceito mantido | Reinterpretação no Fluxsus AI Lab |
|---|---|
| Componentização em utilitários para retrieval, contexto e geração | Módulos TypeScript explícitos por sessão, autorização, tickets, conhecimento, memória, provider e validação |
| Chunking e embeddings locais da pipeline | Tokenizer E5, prefixo `passage:`/`query:`, versão e dimensão 384 |
| Busca vetorial combinada com termos | Fusão de busca híbrida com filtro SQL/RLS anterior, threshold calibrado, top-5 e fonte rastreável |
| Janela de conversa e resumo | 12 mensagens atuais; teto estimado 8.000 tokens; preferências/IDs persistentes; facts carregados da base |
| Resposta que abstém sem contexto | Result `respondido`, `ambiguo`, `sem_evidencia` ou `indisponivel`, com fonte e validação de status |
| Falhas e retries de API | Saída transparente e timeouts; teto US$1/100 chamadas e reserva antes de cada tentativa |
| Contexto e conhecimento empresarial | Dados de tickets sintéticos com grants/participação + procedimentos fictícios e OWASP público para segurança |

## Conclusão de adequação

O exemplo é uma boa referência de laboratório para explicar onde retrieval e memória se encaixam, mas não é um sistema multiusuário nem um módulo seguro que possa ser conectado diretamente a tickets da empresa. O protótipo mantém as etapas pedagógicas que ajudam a atividade e acrescenta os controles que faltam para um cenário com permissões diferenciadas e informação operacional. A calibração foi concluída em dez exemplos; a avaliação final é uma regressão sintética em 30 casos, interpretada com as limitações registradas em `04-avaliacao-metodo.md` e `13-registro-experimentos.md`, não um holdout independente nem validação empresarial.

