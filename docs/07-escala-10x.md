# Análise de crescimento de uso em 10×

**Natureza da análise:** exercício de arquitetura para a atividade. O protótipo tem seed pequeno (24 tickets e oito contas planejadas) e não executou uma prova de carga. As medidas abaixo são ações recomendadas se o volume de documentos e requisições crescer dez vezes; não são promessa de SLO ou capacidade comprovada.

## O que significa 10× neste protótipo

Assumindo crescimento proporcional do conjunto inicial: 240 tickets em vez de 24, dez vezes mais histórico de eventos/mensagens e mais consultas simultâneas. O número de contas ativas, a taxa de mensagens por usuário, o tamanho médio dos tickets, o número de fontes novas por dia, limites de latência e orçamento mensal ainda não estão especificados. Sem esse perfil não é possível calcular hardware ou throughput; primeiro instrumentar e medir.

## Efeito por componente

| Componente | Possível gargalo | Resposta incremental |
|---|---|---|
| API e pool PostgreSQL | Muitas chamadas esperando conexão durante busca, sessão e contexto | Pool de leitura/escrita finito, timeout/backpressure, consultas preparadas, métricas de espera e percentis |
| Autorizações / RLS | Join de participação e grants repetido em cada caminho | Índices compostos nas chaves de `participant`, ticket e estado de grant; medir `EXPLAIN (ANALYZE, BUFFERS)` com contas de roles reais |
| Busca vetorial | Varredura exata em tabela de chunks cresce com corpus | Manter scan exato no conjunto pequeno; considerar HNSW quando medição justificar. Índice aproximado reduz recall e deve ser medido contra golden queries |
| Busca full-text + vetor | Combinar dois conjuntos candidatos sob filtros seletivos | Aplicar sujeito e filtros em ambas as consultas, limitar candidatos antes da fusão, medir interseção/recall depois do filtro |
| Embedding local | Inicialização/CPU do modelo competindo com API | Carregar o modelo uma vez por worker; fila limitada para ingestão, lote de chunks, worker separado quando CPU afetar latência web |
| Ingestão | Mudança de vários documentos pode bloquear pesquisa ou deixar versão antiga | Fila idempotente, lote transacional por source/version, status pendente/ativo, retries idempotentes, métricas de atraso |
| DeepSeek | Custo/limite de chamadas externo e latência variável | Limite de concorrência, timeout, budget per-call, circuit breaker operacional, não repetir chamadas ambíguas sem contabilizar orçamento |
| Conversas e memória | Leituras ordenadas/varredura de mensagens crescem | Índice `(conversation_id, created_at)` e associação por user; buscar somente janela necessária e fatos atuais por ID |
| Interface | Listagens volumosas e payload de eventos | Paginar tickets e eventos, devolver campos mínimos, usar cursor com ordenação estável |

pgvector executa por padrão busca exata de vizinhos, que preserva recall, e oferece índices aproximados HNSW e IVFFlat quando velocidade supera recall perfeito. Essa troca requer benchmark local de relevância e medição após os mesmos filtros de permissão. [pgvector README](https://github.com/pgvector/pgvector).

## Plano de escala por etapas

### Etapa A: medir primeiro

Registrar sem texto sensível: duração por etapa (`session`, `authorization`, `exact-query`, `embedding`, `semantic`, `fulltext`, `fusion`, `model`, `validation`, `persist`), quantidade e score dos candidatos, versão e estado da indexação, tamanho estimado do contexto, tokens reais retornados e erro do provider. Guardar `requestId` para correlacionar, mas nenhum prompt completo, segredo ou corpo restrito em log de produção.

Medir com seed multiplicado por dez e perguntas rotuladas: latência p50/p95/p99; consultas/seg; espera de pool; uso CPU/memória e tempo de embedding; tempo de ingestão; recall@5/F1 versus varredura exata; tempo de decisão RLS; custo real por grupo de uso.

### Etapa B: indexação relacional correta

Antes de adicionar índice vetorial, verificar plano de consultas para permissões e filtros por versão, ticket e source. Adicionar índices aos campos de ligação e expressão full-text. Repetir teste de autorização sob RLS e carga concurrente: otimização que reduz os resultados autorizados é regressão de segurança.

### Etapa C: HNSW se a medição justificar

Criar HNSW para vetor de dimensão 384 com distância cosine, calibrar `ef_search` e limites de candidatos. Medir recall de top-5 contra scan exato do mesmo conjunto autorizável; manter consultas exatas por ID em SQL. Reindexar ou fazer vacuum quando o ciclo de atualização/delete degradar os planos. Não ativar IVFFlat antes de haver corpus suficiente para clusters, pois o treinamento e configuração de listas afetam o resultado.

### Etapa D: desacoplar trabalho CPU

Se embeddings locais competirem com requisições de chat, separar API e worker de ingestão em processos/containers diferentes, com fila persistente e chave idempotente source+version+chunk. Aplicar tamanho máximo e limitação de fila; se atrasar a ingestão, marcar source como pendente e bloquear retrieval semântico de versões stale.

### Etapa E: controlar concorrência e custo de geração

Definir quota por sessão/usuário autenticado e limites de concorrência global antes do provider. A soma da reserva mais custo efetivo é reconciliada depois de cada chamada; ao bater teto, a API passa a indisponível para geração paga e mantém comportamento local determinístico. Retry precisa criar reserva para custo máximo possível em cada nova tentativa.

### Etapa F: cache sem cruzar permissões

No protótipo inicial não há cache de resposta por conteúdo privado. Se houver volume que o justifique, chave do cache incluirá user/session ou conjunto e versão de entitlement, ID(s) do ticket com versão, IDs e versão de corpus, modelo, configuração e modo. Invalidação ocorre em atualização de ticket/documento, concessão/revogação e desativação. É proibido buscar compartilhado e filtrar depois. O cache jamais autoriza leitura: antes de devolver hit revalidar sessão e todas as fontes atuais.

## Custos de modelo a 10×

O vetor E5 roda localmente; a despesa variável de geração vem dos tokens encaminhados para DeepSeek. Uma estimativa do período é:

```text
calls = mensagens que exigem geração + retries pagos
tokens_input = sistema + regras + histórico permitido + evidências + pergunta
tokens_output = respostas curtas, limitadas a 1.024
custo = (tokens_input / 1.000.000 × taxa_input_cache_miss)
      + (tokens_output / 1.000.000 × taxa_output)
```

Esse cálculo é teto conservador por usar preço de pico/cache-miss. Não assumir cache hit até o endpoint indicar o uso. A tabela consultada em 12/10/2026 para `deepseek-flash` listava US$0,30/1M input sem cache e US$1,20/1M output em horário de pico; horários não pico custavam metade, e input cache hit era mais barato. Consultar fonte oficial na data do uso, pois DeepSeek declara que preço pode mudar: [Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing/).

Mesmo 10× não determina dez vezes o custo total se mais perguntas forem atendidas determinísticamente por ID, se o contexto puder ser curto ou se houver cache legítimo. A telemetria real por tipo de intenção é necessária para um orçamento mensal.

## Riscos que uma ampliação não resolve

- RLS continua precisando de transação vinculada ao sujeito e teste com credenciais que não bypassam política.
- HNSW perde recall comparado à busca exata e o conjunto filtrado por ACL pode reduzir resultados disponíveis; nunca usar índice aproximado como garantia de encontrar tudo.
- Um cache não pode reter respostas para grants revogados nem fatos de ticket já alterados.
- Mais contexto não significa maior qualidade; passa a custar tokens e competir por atenção do modelo.
- Escalar chamadas aumenta risco de exceder saldo se reservas e retries não estiverem corretos.
- O limite de US$1 é para avaliação acadêmica atual, não é uma recomendação de orçamento para a empresa.

## Critério de entrada para trabalho de escala

Antes de escolher uma plataforma vetorial dedicada ou mais réplicas, executar a carga de 10× de forma controlada e comparar: p95 por consulta; recall@5; throughput; falhas/timeout; custo por resposta; negações autorizadas por engano; e canários que capturam qualquer conteúdo restrito. Uma falha de isolamento reprova o ensaio independentemente de throughput. A mudança para Pinecone ou outro serviço requer análise de transferência de conteúdo, metadados de autorização, revogação e consistência de atualização.

