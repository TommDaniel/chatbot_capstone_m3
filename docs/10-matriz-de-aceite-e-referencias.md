# Matriz de aceite dos cinco prints e referências

**Data de leitura das fontes públicas:** 12/10/2026. **Evidência do projeto:** a matriz aponta documentação e artefatos que o gerador deve incorporar; pendências aparecem como pendências, e não como aceite presumido.

## Rastreabilidade dos requisitos dos prints

| Print | Requisito legível | Resposta no projeto | Evidência esperada para aceite |
|---|---|---|---|
| 1. Arquitetura do sistema | Diagrama/descrição de interface de entrada, gerente de contexto, retriever, gerador e saída | [Arquitetura](01-arquitetura.md), seções “Componentes” e “Diagrama do sistema” | Diagrama e fluxo presentes no relatório; demonstração de ponta a ponta |
| 1. Arquitetura do sistema | SDK, vector store, embedding e modelo de geração | [Arquitetura](01-arquitetura.md), tabela de tecnologias | Configuração e versão em código/ambiente; captura da conversa e fontes |
| 1. Arquitetura do sistema | Justificar modelo e vector store | ADR-03/04 em [Arquitetura](01-arquitetura.md) | Decisão de PostgreSQL/pgvector e E5 vs alternativas; evidência de preço com data de consulta |
| 1. Arquitetura do sistema | Fluxo do input até resposta entregue | [Arquitetura](01-arquitetura.md), “Fluxo de uma solicitação” | Logs sem dado sensível, requestId e resultado verificados; screenshot de interface |
| 1. Arquitetura do sistema | Documentar antes da implementação | `docs/00-plano-e-contrato.md` antecede implementação; ADRs em 01 registram motivo e consequência | Histórico, decisões aprovadas e referência na entrega |
| 2. Contexto e memória | Número de mensagens mantidas e critério de truncamento | [Acesso e memória](02-controles-de-acesso-e-memoria.md) e [RAG](05-pipeline-rag.md) | Teste mostra janela de 12 mensagens, limite estimado 8.000 e poda de turnos completos |
| 2. Contexto e memória | Diferenciar memória da conversa e memória persistente | [Acesso e memória](02-controles-de-acesso-e-memoria.md) | Demonstração multi-turno e preferência/IDs persistindo após nova sessão |
| 3. Pipeline RAG | Mínimo de três documentos reais com origem e preparação | [Corpus e ingestão](03-corpus.md) | Manifesto de 3 fontes públicas com origem, versão, licença, data e transformação |
| 3. Pipeline RAG | Estratégia de chunking, embedding e vector store | [Pipeline RAG](05-pipeline-rag.md) | Logs/contagens de ingestão, modelo E5 local, chunking 320/48 e vetor 384 |
| 3. Pipeline RAG | Similaridade, top-k e threshold | [Pipeline RAG](05-pipeline-rag.md) | Arquivo de calibração de 10 casos e valor escolhido por F1, antes dos 30 finais |
| 3. Pipeline RAG | Injeção de chunks sem estourar contexto | [Pipeline RAG](05-pipeline-rag.md) | Evidência de até 5 fontes e orçamento de contexto; comparação de top-k/contexto |
| 4. Avaliação | Pelo menos 15 perguntas; escopo final aqui exige 30 | [Avaliação](04-avaliacao-metodo.md) | 30 linhas por pergunta no JSON de saída e PDF, casos individuais visíveis |
| 4. Avaliação | Respondível, fora da base, ambígua, follow-up com memória | [Avaliação](04-avaliacao-metodo.md) | Matriz/categorias e resultados verdadeiros com estado por caso |
| 4. Avaliação | Relevância, fidelidade e coerência | [Avaliação](04-avaliacao-metodo.md) | Notas e N/A justificados por dimensão, agregados e sample size |
| 4. Avaliação | Análise de falhas: retrieval, contexto ou geração | [Avaliação](04-avaliacao-metodo.md) e [Pipeline RAG](05-pipeline-rag.md) | Cada erro classificado com evidência, hipótese e próxima correção |
| 4. Avaliação | Tabela por pergunta e padrão geral | [Relatório PDF](../scripts/report.py) | PDF gerado a partir de `output/*.json`, sem linhas fabricadas |
| 5. Decisão de customização | Framework prompt engineering → RAG → fine-tuning | [Decisão de customização](06-decisao-de-customizacao.md) | Decisão justificada e ordem comparativa descrita |
| 5. Decisão de customização | Se fine-tuning, 50 exemplos + comparação em 10 casos | [Decisão de customização](06-decisao-de-customizacao.md) | Nesta versão não há treino; requisito condicionado não se aplica. Se houver treino futuro, 50+ JSONL e 10 casos congelados |
| 5. Decisão de customização | Se não houver fine-tuning, justificar com evidência RAG + prompt | [Decisão de customização](06-decisao-de-customizacao.md) e [Avaliação](04-avaliacao-metodo.md) | Regressão live final alcançou 30/30 de rótulo esperado em RAG; revisão qualitativa assistida favorável no conjunto sintético. Sem avaliador humano independente e sem validade operacional |
| 5. Decisão de customização | Analisar o que mudaria com 10× volume | [Escala 10×](07-escala-10x.md) | Medidas exigidas e mudanças de arquitetura; não alegar benchmark ainda inexistente |

## Critérios de aceite consolidados

| Critério acadêmico | Como verificar |
|---|---|
| Arquitetura clara e modular | Responsabilidade por camada, fronteira entre autorização/retrieval/geração, contratos e rota de falha documentados e no código |
| Comportamento consistente e controlado | Saída estruturada com estado; política de abstinência; fonte validada; testes adversariais e transições legais |
| Memória funcional e relevante | Reutiliza até 12 mensagens, respeita orçamento e remove memórias ligadas a fontes cujo acesso foi perdido |
| Conhecimento corretamente usado e reduz alucinação | Evidências recuperadas e citadas; leitura exata de estado; 30 resultados e métricas reais no relatório |
| Engenharia reutilizável e documentação clara | Migrations, seeding, corpus com proveniência, contratos, avaliação e comandos reprodutíveis |
| Confidencialidade | Nenhum conteúdo restrito entra em prompt, fonte, histórico reaproveitado ou saída no teste canário |

O aceite de confidencialidade é bloqueante. A meta de pelo menos 90% de recuperação de evidência nos casos respondíveis e médias de 4/5 em dimensões aplicáveis também é registrada com denominador, versão do dataset e failures; se não alcançar a meta, o resultado reporta reprovação e limitações, não substitui os valores.

## Referências públicas e por que foram consultadas

| Referência e acesso | Uso para este projeto | Limite da aplicação |
|---|---|---|
| [Anthropic: Prompting best practices](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/prompt-templates-and-variables), consultado em 12/10/2026 | Clareza, exemplos, hierarquia e delimitação de contexto em prompt | Guia orientado a modelos Claude; princípios são referência de desenho, não garantia de compatibilidade do DeepSeek |
| [MCP: introdução oficial](https://modelcontextprotocol.io/docs/2026-07-28/getting-started/intro), consultado em 12/10/2026 | Entender protocolo para exposição padronizada de contextos e ferramentas | Não há MCP dentro do runtime do protótipo; REST própria já cobre interface necessária e nenhuma ferramenta externa é autorizada |
| [Pinecone Learn](https://www.pinecone.io/learn/) e [Pinecone docs](https://docs.pinecone.io/), consultado em 12/10/2026 | Referência de busca vetorial, recuperação híbrida e operação em serviço separado | Serviço não adotado; não enviaremos conteúdo real a uma store externa |
| [LlamaIndex Framework](https://developers.llamaindex.ai/python/framework/), consultado em 12/10/2026 | Conceitos de pipeline RAG, indexing, query, memory, storage e avaliação | Framework não adotado; pipeline explícita no TypeScript evita adicionar abstração para um protótipo pequeno |
| [Context7](https://context7.com/), consultado em 12/10/2026 | Referência para consulta de documentação de bibliotecas durante desenvolvimento | Ferramenta de consulta de docs não faz parte do runtime nem substitui documentação oficial/versionada |
| [DeepSeek Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing/), consultado em 12/10/2026 | Confirmar API, modelo, modos, taxas e horários de preço | Preço muda; reconfirmar antes de teste pago e nunca usar no teto custos antigos |
| [DeepSeek First API Call](https://api-docs.deepseek.com/), consultado em 12/10/2026 | Endpoint OpenAI-compatible (`https://api.deepseek.com`) e nome `deepseek-flash` | Compatibilidade deve ser validada no código e na chamada real |
| [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/), consultado em 12/10/2026 | Textos de autenticação, autorização e sessão, sob CC BY-SA 4.0 | Referência técnica pública; os manuais sintéticos são os únicos que definem procedimentos do protótipo |
| [PostgreSQL 17: Row Security](https://www.postgresql.org/docs/17/ddl-rowsecurity.html), consultado em 12/10/2026 | Comportamento e limites de RLS; bypass por superusuário e proprietário | Confirmação de RLS requer teste com papel runtime sem bypass |
| [pgvector](https://github.com/pgvector/pgvector), consultado em 12/10/2026 | Distâncias, busca exata, HNSW, IVFFlat e integração com full-text | Índice aproximado só entra depois de benchmark de recall/autorização |
| [Xenova multilingual E5 small](https://huggingface.co/Xenova/multilingual-e5-small), consultado em 12/10/2026 | ONNX para Transformers.js; modelo multilíngue de extração de feature | Tempo e qualidade em português devem ser medidos no equipamento do projeto |

O caminho original da referência Anthropic no enunciado redireciona para a documentação atual de boas práticas. MCP, Pinecone e LlamaIndex foram estudados como conceitos comparativos; citar um produto não significa integrá-lo ou endossar seus resultados.
