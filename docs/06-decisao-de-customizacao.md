# Decisão de customização: prompt engineering → RAG → fine-tuning

**Data da decisão:** 12/10/2026. **Estado empírico:** há três rodadas live e uma regressão final após correção de ingestão. A revisão disponível é qualitativa assistida por agente; não houve avaliador humano independente. Conclusões se limitam à amostra e aos dados sintéticos.

## Framework de decisão

O custo de mudar comportamento cresce quando a solução deixa de depender somente de instruções e recuperação. A seleção foi feita em sequência: estabilizar regras de comportamento e interface de contexto por prompt engineering; acrescentar fontes atualizadas por RAG quando fatos precisam ser atualizados ou citados; só então considerar fine-tuning para falhas recorrentes de estilo/formato que exemplos representativos possam corrigir.

| Etapa | Que problema resolve melhor | Dados que exige | Atualização | Lugar neste protótipo |
|---|---|---|---|---|
| Prompt engineering | Papel, limites, formato, política de incerteza, ordem e separação de contexto | Instrução curta e exemplos revistos | Rápida, versionada como texto/código | Implementado na montagem modular do contexto; aferir em testes adversariais |
| Retrieval-augmented generation (RAG) | Fatos locais, versão vigente, citações e recuperação seletiva | Documentos e metadados, acesso por registro, perguntas com fonte esperada | Atualiza fonte e indexa sem retreinar o modelo | Núcleo de conhecimento; tickets mudam com frequência e são consultados do banco |
| Fine-tuning | Padrões de comportamento/saída estáveis que prompting e RAG não corrigem com robustez | Dataset aprovado e representativo, pelo menos 50 exemplos se a técnica for escolhida na atividade | Exige nova rodada de treinamento e avaliação | Não selecionado nesta versão; prompting + RAG atenderam o escopo sintético revisado com agente; sem dados representativos de produção ou avaliador humano independente |

## Por que não ajustar pesos nesta versão

1. O tipo de conhecimento central do chatbot é mutável. Status e permissões mudam por evento; colocar esses fatos nos pesos os deixaria desatualizados e não permitiria revogar acesso.
2. Tickets são dados operacionais e, no cenário real, podem conter dados pessoais ou potencialmente informações de saúde. O projeto não tem autorização para usá-los em treino; substitui por valores sintéticos e não cria exemplo com dado corporativo.
3. A tarefa não oferece uma verdade textual de 50 pares de treino revisados por especialistas. Seed artificial e avaliação não são dataset de fine-tuning: utilizar casos finais no treino contaminaria a avaliação.
4. A identidade, o cargo e o acesso devem ser aplicados como regras determinísticas no servidor/banco. Ajustar pesos não constitui controle de acesso auditável.
5. O custo e os passos adicionais de treinamento não são necessários para testar a hipótese do capstone: contexto modular e retrieval autorizado podem ajudar em fatos verificáveis.

Essas razões justificam a decisão de projeto. Na regressão final após a correção do corpus, prompting obteve 23/30 e RAG 30/30 igualdades de rótulo; isso compara `actualResult` com `expectedResult`, não a correção factual. Sete casos por variante chamaram a DeepSeek, com oito chamadas pagas porque eval-17 consulta a pergunta e seu follow-up; as demais linhas são determinísticas ou falhas injetadas. A revisão qualitativa assistida v2 registrou prompting — relevância 2,22/5 (n=18), fidelidade 5/5 (n=8 respondidos), coerência 4,50/5 (n=4), abstenção 5/5 (n=22) e resolutividade 3,83/5 (n=30) — e RAG — relevância 4,50/5 (n=18), fidelidade 5/5 (n=15 respondidos), coerência 5/5 (n=4), abstenção 5/5 (n=15) e resolutividade 5/5 (n=30). Recusas, esclarecimentos e indisponibilidades ficam N/A em fidelidade e são avaliados em abstenção. A anotação é assistida por agente (`agentReviewed=true`, `manualReview=false`), sem avaliador humano independente. A revisão v2 não alterou respostas, classes, igualdade de rótulos, métricas automáticas, custo nem tokens; ela substitui a rubrica anterior para interpretação qualitativa. Essa evidência apoia a solução para os casos sintéticos e procedimentos simulados do protótipo, mas não demonstra qualidade geral nem prontidão empresarial. **Fine-tuning não é necessário para a demonstração e não foi implementado**: conhecimento de tickets e permissões é dinâmico, e não existe conjunto aprovado de 50 exemplos representativos revisados por especialistas. Se uma futura avaliação humana identificar falhas de estilo ou formato persistentes após confirmar retrieval e autorização, coletar dados sintéticos balanceados e comparar base e fine-tuned em dez casos congelados. Se a falha for acesso, recuperação ou estado atual, corrigir a arquitetura em vez de ajustar pesos.

## Desenho da comparação

A avaliação compara um baseline de prompting com o modo RAG mantendo a mesma aplicação, a mesma identidade autenticada, políticas de acesso, fonte de regras e modelo. A variável é a disponibilização de evidência recuperada no contexto. O baseline não pode desabilitar RLS nem testar com conteúdo de outra pessoa: “prompting isolado” significa sem evidência adicional de RAG, sob as mesmas fronteiras de segurança. Essa escolha é executada pelo harness interno; o endpoint público `/api/chat` não aceita parâmetro para o cliente desligar a recuperação.

Para responder a uma pergunta sobre o ticket, a camada estruturada de autorização e leitura é invariável. A comparação de geração não expõe outro ticket quando mede prompting; a saída correta fora da evidência é declarar que não há informação suficiente. Anotar `result`, notas automáticas de triagem, revisão qualitativa assistida por agente e eventual revisão humana independente, latência, tokens e custo estimado; os casos que não chamam API têm custo zero para aquela execução e são indicados separadamente. Consultas exatas por ticket são resultados determinísticos e não podem ser contadas como ganho de geração RAG ou como chamada DeepSeek.

| Evidência observada | Interpretação | Decisão seguinte |
|---|---|---|
| Evidência esperada não aparece entre top-5 | Falha de corpus/retrieval ou interpretação da consulta | Ajustar preparação, chunking, prefixo, busca lexical/vetorial/threshold e recalibrar |
| Evidência certa e autorizada aparece, resposta distorce o que diz | Falha de contexto/generation | Melhorar schema/instruções, diminuir trechos concorrentes, verificar JSON e factualidade |
| Fonte restrita aparece em recuperação/contexto/log de modelo | Falha de autorização ou isolamento | Rejeitar a execução, corrigir transação/RLS/consulta/cache, refazer canário completo |
| Pergunta não pode ser respondida, mas modelo inventa | Política de abstinência ou validação fraca | Ajustar threshold, condição de evidência e validador; falha fica na tabela |
| Resposta cai em follow-up legítimo | Gestão da memória | Revisar poda por turno, referências persistentes e associação de fonte |
| Resposta só fica inconsistente em modelos/providers | Compatibilidade/geração | Manter contrato estrutural, testar endpoint/parâmetros e revisar escolha do provider |

## Decisão sob restrições de custo e dados

Modelo configurado: `deepseek-flash` pela compatibilidade documentada com formato OpenAI; geração com modo de pensamento desligado e `max_tokens` de 1.024. E5 é executado localmente e não depende de serviço pago. Como a API cobra tokens de entrada e saída e seus valores podem mudar, estimar custo máximo de cada tentativa com preço de pico, reservar antes do envio, contar retry como nova chamada e conferir a resposta de uso que o servidor reportar.

Limite escolhido para a campanha paga: no máximo US$1 e 100 chamadas incluindo retries. Três rodadas live registraram 47 chamadas e um teto cumulativo estimado de US$0,011013; a última regressão consumiu 16 chamadas. Esse cálculo usa os preços oficiais conferidos em 12/10/2026 e uma tarifa conservadora de pico/cache miss; não representa valor faturado. Reconfirmar [DeepSeek Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing/) antes de qualquer nova execução paga. Uma execução com chave ausente ou falso provider deve gerar estado explícito `pending`/`mock` e o relatório identificará essa condição.

## Fine-tuning em uma próxima versão

Fazer fine-tuning somente se: (a) todas as fontes corretas aparecem; (b) permissões passaram; (c) as falhas restantes são instrução/estilo/formato persistentes; (d) usuário autorizou e a política de dados aceita os exemplos. Dataset deve conter pelo menos 50 exemplos aprovados, não usar texto de produção, incluir cenário respondível, abstinência, ambiguidade e prompt injection, e ser validado pelo script de JSONL. Reservar 10 casos separados para comparar base vs fine-tuned sem expor informações de identidade na chamada.

Avaliar por caso, reportar custo e latência à parte e manter a versão base de referência. Resultado apenas melhor no dataset de treino não comprova ganho; contar casos de holdout, consistência e falhas de acesso. O ganho de geração nunca substitui controles de banco.

