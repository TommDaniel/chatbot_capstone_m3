# Registro de experimentos e correções

## Rodadas finais offline (12/10/2026)

`output/calibration.json` congelou threshold `0.85`: F1 micro por documento `1.000`, precision `1.000`, recall `1.000` (8 TP, 0 FP, 0 FN). `0.75` e `0.80` empataram; `0.85` foi escolhido como maior threshold com F1 máximo. A rodada anterior, preservada em `output/calibration-initial.json`, atingiu F1 `0.769` e recall `0.625` em `.90`; não foi misturada aos resultados atuais.

`output/evaluation-offline.json` contém 60 observações de teste, 30 por variante. Prompting isolado coincidiu com o rótulo esperado em `23/30`; RAG em `30/30`. Esse campo compara apenas `actualResult` e `expectedResult`: não pontua correção factual. Cada variante tem 26 casos fake/determinísticos e 4 falhas de provedor injetadas, com zero chamadas pagas e zero chamadas à DeepSeek. As métricas automáticas foram: prompting, recuperação `2.22/5 (n=18)`, fidelidade `3.33/5 (n=30)`, coerência `3.00/5 (n=4)`; RAG, recuperação `4.86/5 (n=18)`, fidelidade `4.40/5 (n=30)`, coerência `4.25/5 (n=4)`. São heurísticas, não rubrica humana; portanto, esta rodada não mede a qualidade de geração do modelo nem permite concluir que RAG seja suficiente. O avaliador atualizado também grava `turns[]`, com `question`, `response` e `trace`; a execução offline mais recente validou essa estrutura nas 60 linhas sem chamadas ao provedor.

Artefatos `*-initial.json` permanecem como histórico de falhas e diagnóstico. O relatório final usa apenas JSONs finais e agrega cada execução separadamente por modo e variante.

## Rodadas live DeepSeek e regressão final (12/10/2026)

`output/evaluation-live.json` é a regressão final, criada às 18:22 UTC, com modelo `deepseek-flash`, threshold `.85` e 60 registros. Prompting atingiu 23/30 e RAG 30/30 em igualdade do rótulo `actualResult` com o `expectedResult` — comparação de status, não precisão factual. Sete registros por variante têm uma resposta da DeepSeek; eval-17 conta dois turnos (pergunta + follow-up), totalizando oito chamadas pagas por variante e 16 nesta rodada. As outras 19 linhas por variante são determinísticas e quatro por variante usam falhas injetadas. A rodada final somou 8.287 tokens de entrada e 1.015 de saída. Seu custo é estimado em US$0,0037041 pelo teto de tarifa de pico/cache miss. Considerando três rodadas live, o ledger acumulou 47 chamadas e US$0,011013 de custo superior estimado. Estes não são valores faturados. Essa resposta live preservada contém o campo `answer` final, a pergunta e os follow-ups declarados, mas não tem `turns[]`; não reconstruímos detalhes de turno que o snapshot não registrou.

| Variante | Igualdade do rótulo `actualResult == expectedResult` | Recuperação automática | Fidelidade automática | Coerência automática | Execução live |
|---|---:|---:|---:|---:|---|
| Prompting | 23/30 | 2,22 (n=18) | 3,33 (n=30) | 3,00 (n=4) | 7 registros chamaram DeepSeek; 8 chamadas pagas com dois turnos em eval-17 |
| RAG | 30/30 | 4,86 (n=18) | 4,50 (n=30) | 4,25 (n=4) | 7 registros chamaram DeepSeek; 8 chamadas pagas com dois turnos em eval-17 |

### Revisão qualitativa assistida v2

As notas abaixo são anotações explícitas do snapshot v2, separadas das métricas automáticas. O agente no papel de professor leu os chunks recuperados e as respostas; todas as 60 linhas têm `agentReviewed=true`, `reviewType=agent-assisted qualitative review` e `manualReview=false`. Fidelidade é avaliada somente para respostas com afirmações factuais verificáveis; recusa, esclarecimento e indisponibilidade recebem N/A em fidelidade e nota na dimensão de abstenção. Não se deriva fidelidade de `resultMatches`.

| Variante | Relevância dos chunks | Fidelidade factual | Coerência | Abstenção | Resolutividade |
|---|---:|---:|---:|---:|---:|
| Prompting | 2,22/5 (n=18) | 5/5 (n=8 respondidos) | 4,50/5 (n=4) | 5/5 (n=22) | 3,83/5 (n=30) |
| RAG | 4,50/5 (n=18) | 5/5 (n=15 respondidos) | 5/5 (n=4) | 5/5 (n=15) | 5/5 (n=30) |

Na relevância por chunk de RAG, eval-01=4, eval-02=3, eval-03=5, eval-06=4, eval-07=5, eval-08=3, eval-17=4, eval-24=4, eval-26=5 e eval-27=4. As outras oito consultas exatas receberam 5/5. Em eval-07, `metrics.retrieval=2.5` porque a heurística esperava dois IDs, mas uma seção do `manual-acessos` cobria as condições de encerramento por cargo e acesso. Em eval-08, o chunk Change Password sustenta a resposta e o chunk de Logging and Monitoring é ruído; por isso a nota por chunk é 3/5.

O snapshot v2 registra `qualitativeReviewVersion=2` e o hash SHA-256 do snapshot de entrada em `reviewInputSha256` (`e5a74bd5da29bf0442e0637d879a0d15e37b46780c77ddf482065a411c6a182e`). O verificador de `scripts/apply-reviewed-results.ts` recusa uma entrada com hash diferente; mudanças nos resultados exigem nova revisão, sem reaproveitar anotações. A revisão é assistida por agente e não é avaliação humana independente.

O arquivo `output/evaluation-live-rubric-v1-initial.json` conserva a revisão anterior somente como histórico explicitamente superado: suas notas RAG de relevância 5/5 (n=18) e fidelidade 5/5 (n=30) não são os resultados atuais. A v2 corrigiu a granularidade da relevância para chunk, limitou fidelidade a respostas avaliáveis e criou a dimensão de abstenção. A v2 alterou somente as anotações e justificativas de revisão; respostas, classes, rótulos, métricas automáticas, tokens e custos brutos do snapshot permanecem iguais.

As sete divergências de prompting são perguntas respondíveis às quais o baseline deliberadamente sem evidência RAG se absteve. Na primeira rodada RAG, preservada em `output/evaluation-live-initial.json`, eval-08 falhou porque retornou cabeçalho/licença OWASP sem a seção que descrevia a troca de senha. A rodada com título em todos os embeddings, preservada em `output/evaluation-live-title-initial.json`, resolveu eval-08 e regrediu eval-03. O preparo final passou a indexar seções do corpo e a incluir título apenas para fontes públicas em inglês; a regressão final obteve 30/30 nos mesmos casos. Rodadas são repetição do mesmo conjunto de 30 casos, não holdouts independentes. A conclusão favorável limita-se à amostra sintética: o resultado suporta prompting+RAG nesse escopo, mas não valida uso empresarial, saúde ou produção.

## 12/10/2026: preparação e testes

As primeiras execuções são preservadas neste registro; os JSON em output representam a última rodada de cada suíte, não a ausência histórica de falhas.

1. O executor restrito passou a falhar após retomada com CryptUnprotectData. Execuções aprovadas fora do sandbox de processo permitiram continuar; não houve mudança em arquivos ou credenciais de outros projetos.
2. O Docker precisou ser reativado na retomada. Banco vinculado exclusivamente a 127.0.0.1:55432; dados persistiram no volume do projeto.
3. Cache ONNX tinha tamanho correto (118.308.185 bytes), porém protobuf inválido. Hash local A16DE9...25164 divergia do SHA256 publicado F80102D3F2A1229F387D3C81909990D8945513E347B0EAB049F7DE3C6F98C193. Novo download validado corrigiu o cache. Preparação agora usa arquivo temporário, hash publicado e substituição somente depois da validação.
4. Primeira rodada de integração: cinco testes aprovados e sete bloqueados pelo limite de dez logins/minuto no IP compartilhado da suíte. O limite demonstrou funcionar; o harness passou a reutilizar sessões, sem retirar a proteção de produção.
5. Contratos de interface revisados: preferências não enviam IDs de tickets arbitrários, senha mínimo 12, mensagem máximo 2.000, título mínimo 5. Modal e concessões inativas corrigidos.
6. Teste de cargo forjado: requisição com campo role desconhecido recebe 400 por schema strict antes de autorização; 403 se a requisição válida pede ação não permitida. Ambos preservam a fronteira de confiança.
7. Defesa adicional: INSERT de mensagens deve validar acesso a todos os IDs referenciados, além de dono/conversa. A policy foi reforçada após uma regressão detectar a lacuna. Tentativas com IDs sem acesso são persistidas com pergunta sanitizada; o histórico não reutiliza texto de referência negada. O limiter de login usa IP+email no preHandler: dez logins legítimos de contas diferentes não se confundem com dez tentativas da mesma conta.
8. Regressão de saída confirmou que apenas validar IDs de citação não impede trocar o estado de um ticket. O validador passou a conferir afirmações de estado atual, datas ISO/dia-mês-ano e data de atualização contra fontes de tickets. A consulta por ID permanece determinística. Esses checks não provam a fidelidade semântica de todo texto livre; a avaliação/revisão continua necessária.
9. Memória persistente de referências só resolve pergunta explícita sobre o último ticket; pronomes de uma conversa nova continuam ambíguos. Follow-ups de procedimento usam a pergunta anterior e não mudam para o último ticket pessoal. IDs irrelevantes não entram no prompt de uma dúvida de manual.
10. Runner offline detectou que uma referência pessoal revogada podia provocar negativa em uma pergunta genérica de criação de ticket. A condição foi corrigida: negativa por referência revogada exige um follow-up real sobre ticket. Dados desse primeiro runner foram preservados em output/evaluation-offline-initial.json. O limiter global foi restringido a rotas API, por usuário/IP; arquivos de fonte/CSS não podem consumir a cota operacional.
11. A regressão de conversa com contexto revogado usa também anáforas como “essa situação”. Um indicador booleano restrito ao dono da conversa informa se há contexto omitido por revogação, sem devolver IDs ou conteúdo oculto. Assim, a conversa afetada recebe negativa neutra; referências antigas da memória pessoal não interferem em conversas novas ou dúvidas de manual.

## Metodologia de avaliação

Calibração usa dez perguntas independentes, micro F1 por ID de documento; thresholds .75/.80/.85/.90 e desempate pelo maior. Queries exatas por ID são controles determinísticos; perguntas fora de escopo/ambíguas não acionam retrieval. A configuração escolhida é congelada em output/calibration.json antes da avaliação.

Runner gera 60 linhas: 30 casos em prompting isolado e 30 em RAG. mode distingue offline/live; providerMode e calledDeepSeek distinguem fake, falha injetada, resposta determinística e chamada real. Falhas de provedor são injetadas para validar comportamento, não apresentadas como falhas observadas do serviço externo. Custos têm reserva pessimista a preço de pico/cache miss; preços reconfirmados em https://api-docs.deepseek.com/quick_start/pricing/ em 12/10/2026: Flash US$0,30/M entrada e US$1,20/M saída. Descontos efetivos podem reduzir cobrança.

Pontuações automáticas 0-5 são heurísticas (termos esperados e classe de resultado). Não equivalem a julgamento independente de fidelidade: paráfrases podem ser penalizadas e coincidências lexicais podem ser superestimadas. Revisões das respostas reais devem registrar notas e justificativas separadas, sem modificar o resultado bruto.

## Ajuste de recuperação anterior ao holdout

A primeira calibração sem seleção de coleção mostrou F1 máximo .769 e recall .625 em threshold .90: o conjunto inglês OWASP ficou abaixo desse limiar, enquanto thresholds menores trouxeram manuais e referências de assuntos vizinhos. Antes de avaliar as 30 perguntas finais, foi adicionada seleção de coleção por taxonomia: senha/conta, fluxo de tickets, acesso/cargos e referências OWASP. Essas regras selecionam candidatos, não respostas; embeddings, ACL, versão e threshold ainda são aplicados. Questões por descrição sem tópico conhecido continuam buscando nos registros autorizados. A comparação antes/depois é preservada em output/calibration-initial.json e output/calibration.json. Não é permitido retunar no holdout e depois reportá-lo como independente.
