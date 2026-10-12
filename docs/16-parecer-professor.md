# Parecer docente simulado sobre o capstone Fluxsus AI Lab

**Data:** 12/10/2026. **Natureza:** revisão crítica assistida por agente no papel de professor, solicitada pelo autor. Não é parecer emitido pela instituição, nota acadêmica oficial, auditoria de segurança ou avaliação humana independente.

## Veredito de cobertura

**OK para o escopo do enunciado, com recomendações.** Não identifiquei requisito obrigatório ausente entre as entregas gerais e os cinco prints. O projeto apresenta aplicação funcional, arquitetura modular, regras, memória, conhecimento com proveniência, testes, comparação de abordagens, análise de falhas e documentação. A escolha de dados sintéticos é adequada à autorização de adaptação do enunciado e à restrição contratual informada pelo autor.

As duas principais críticas metodológicas desta revisão foram tratadas na anotação qualitativa v2, sem nova chamada paga nem modificação dos resultados brutos. O histórico das críticas e a conferência das correções permanecem abaixo.

Esse OK significa cobertura demonstrada na entrega local inspecionada. Não significa 100% de fidelidade factual, suficiência em qualquer pergunta, prontidão hospitalar, ausência universal de vulnerabilidades nem garantia da nota do professor. Os critérios de qualidade precisam ser interpretados pelos resultados e limitações abaixo; especialmente, **30/30 compara o rótulo de resultado esperado, e não a verdade de todas as afirmações**.

## O que foi efetivamente revisado

Foi feita leitura cruzada da documentação, dos módulos de contexto, recuperação, memória e geração, das políticas SQL, das suítes de unidade/integração/interface, do manifesto do corpus, dos casos de calibração/avaliação e dos resultados JSON. Também foi extraído e consultado o texto do PDF disponível no início desta revisão, com 65 páginas. A evidência de revisão visual existente foi conferida em `output/pdf/quality-review.json`; esta revisão docente não representa uma nova inspeção visual independente de todas as páginas.

Não foi lido o `.env`, não houve chamada paga ao provedor, não foram reexecutadas as suítes, não foi publicado código e não foi utilizado qualquer registro empresarial. Os resultados numéricos abaixo são os artefatos de execução preservados no projeto, confrontados com os respectivos testes e scripts; não são medições novas do agente revisor.

## Matriz de requisitos

Na coluna de situação, **atendido** indica que a entrega correspondente existe e tem evidência verificável; ressalvas apontam a força limitada dessa evidência. **Parcial** ou **não atendido** seriam usados para um item obrigatório sem cobertura suficiente. Não foi necessário classificar item obrigatório dessa forma nesta revisão de cobertura.

| Requisito do enunciado/prints | Situação | Evidências e julgamento |
|---|---|---|
| Arquitetura completa, clara e modular | Atendido | `docs/01-arquitetura.md`, diagrama, contratos e módulos separados de autenticação, tickets, conhecimento, contexto, memória e geração. A autorização antecede a recuperação. |
| Interface, gerenciador de contexto, retriever, gerador e saída | Atendido | Interface React, API Fastify, `server/context.ts`, `server/knowledge.ts`, `server/generation.ts` e `server/chat.ts`; fluxo documentado do login à resposta com fontes. |
| Tecnologias escolhidas e justificadas | Atendido | ADRs em `docs/01-arquitetura.md`: SDK OpenAI compatível com DeepSeek, pgvector/PostgreSQL, E5 local de 384 dimensões e DeepSeek Flash; alternativas e consequências explicitadas. |
| Contexto documentado e controle de comportamento | Atendido | Instruções separadas de identidade/evidências, fontes tratadas como dados, JSON validado, citações e estados/datas conferidos. Testes adversariais e de acesso dão evidência limitada aos cenários cobertos. |
| Janela de contexto e truncamento | Atendido | `server/context.ts`, `server/memory.ts`, `docs/02-controles-de-acesso-e-memoria.md`: até 12 mensagens, orçamento conservador de 8.000 e poda de turnos antigos; três testes de janela/orçamento. |
| Memória de sessão distinta da persistente | Atendido | Conversa e histórico recentes separados de preferências e IDs persistentes. Fatos de tickets são recarregados; revogação remove conteúdo reutilizável. Integração e E2E cobrem revogação e preferência. |
| Corpus com pelo menos três documentos reais, origem e preparação | Atendido | Três excertos de documentos públicos oficiais OWASP, com URL, atribuição, licença, coleta e preparação em `data/corpus/manifest.json`; mais três manuais originais fictícios. Os documentos públicos são reais, embora os tickets e processos empresariais sejam simulados. |
| Chunking, embedding e vector store | Atendido | `server/embeddings.ts` e `docs/05-pipeline-rag.md`: tokenizer E5, 320 tokens/48 de sobreposição, prefixos query/passage, vetores normalizados de 384 dimensões, pgvector. |
| Recuperação, similaridade, quantidade e threshold | Atendido | SQL com autorização/versão antes do ranking, cosine e busca textual, RRF, até cinco chunks; dez casos de calibração e limiar 0,85 documentado. Ressalva: F1 documental não mede utilidade de cada chunk. |
| Injeção dos chunks respeitando a janela | Atendido | `server/chat.ts` reduz evidências completas antes da montagem, e `server/context.ts` preserva regras/pergunta e limita histórico. |
| Pelo menos 15 perguntas incluindo respondíveis, fora da base, ambiguidade e memória | Atendido | `evaluation/cases.json` contém 30 casos; `evaluation/calibration.json` contém dez de desenvolvimento. Há cenários de revogação, atualização e falhas do provedor. |
| Avaliação de relevância, fidelidade e coerência; tabela por pergunta | Atendido, com ressalva metodológica | `output/evaluation-live.json`, `scripts/evaluate.ts` e PDF contêm respostas/fontes/notas e tabelas por caso. As notas automáticas/assistidas existem, mas não constituem revisão humana independente. Recomendações 1 e 2 abaixo fortalecem sua validade. |
| Análise honesta de falhas e hipóteses de causa | Atendido | `docs/13-registro-experimentos.md` e `docs/15-dependencias-e-ingestao.md` preservam falhas OWASP/cabeçalho e regressão do título, com causa de recuperação/ingestão e correção. JSONs iniciais não são apagados nem apresentados como rodada final. |
| Framework prompt engineering → RAG → fine-tuning | Atendido | `docs/06-decisao-de-customizacao.md`: decisão comparativa, conhecimento dinâmico, controle determinístico e inexistência de dataset apropriado aprovado. Não há obrigação de fine-tuning quando ele não foi escolhido. |
| Justificar ausência de fine-tuning com evidências | Atendido para o protótipo | Procedimentos observados na amostra receberam evidência e resposta sustentada com RAG; prompting sem corpus se absteve. As sete respostas generativas RAG inspecionadas estão apoiadas nos respectivos chunks. A conclusão é limitada ao conjunto sintético conhecido. |
| Discutir crescimento de 10× | Atendido | `docs/07-escala-10x.md`: concorrência, workers, filas, índices, custos e cache isolado/invalidação. Enunciado pede análise, não prova de carga; o documento declara que não há benchmark. |
| Casos reais de uso, demonstração funcional e engenharia reutilizável | Atendido | Necessidade real adaptada sem dados reais; painel de tickets, chat, conta/concessões, seis screenshots, roteiro em `docs/08-operacao-e-demonstracao.md`, Docker, migrations, seeds e testes. |
| Comparar criticamente o exemplo | Atendido | `docs/11-analise-do-projeto-exemplo.md` identifica separação incompleta dos fluxos CLI/RAG, falta de autenticação/ACL/versionamento e oportunidades reaproveitadas; original ZIP preservado. |

## Conferência dos resultados e de sua interpretação

1. **Testes automatizados:** `output/unit-tests.json` registra 11 aprovados; `output/integration-tests.json`, 18; `output/e2e-results.json`, três esperados e zero falhos. A soma de 32 está coerente com os arquivos de teste. As integrações usam PostgreSQL/RLS e gerador falso, e os E2E não medem qualidade do modelo.
2. **Dados:** `output/run-summary.json` registra oito usuários, 24 tickets, seis documentos e 130 chunks. O corpus público é separado dos manuais e não fornece prova de procedimentos reais da empresa.
3. **Calibração:** o resultado congelado selecionou 0,85 com micro-F1 documental 1,00 no conjunto pequeno de desenvolvimento. O resultado anterior inferior está preservado. Isso não significa que qualquer novo assunto ou paráfrase obtenha o mesmo recall.
4. **Avaliação final:** há 60 linhas, 30 por variante; RAG coincidiu com o rótulo esperado em 30/30, e prompting em 23/30. Em cada variante, sete casos chamaram DeepSeek e totalizaram oito chamadas, porque o caso 17 inclui dois turnos. Os demais casos são 19 respostas determinísticas e quatro falhas injetadas por variante.
5. **Respostas reais inspecionadas:** eval-01 (senha), 02 (abertura), 03 (estados/resolução), 06 (acesso), 07 (supervisora), 08 (OWASP) e 17 (procedimento/follow-up) apresentaram afirmações finais compatíveis com os chunks citados. Esta leitura qualitativa assistida dá sustentação concreta ao uso de conhecimento nesses casos, sem transformar os scores automáticos em certificação.
6. **Falhas:** o primeiro eval-08 foi diagnosticado como recuperação de cabeçalho sem conteúdo útil; o enriquecimento amplo de título corrigiu esse caso, mas regrediu eval-03. A correção final foi validada nos mesmos casos. O projeto diz corretamente que se trata de regressão após ajuste, não de novo holdout independente.
7. **Custo:** o ledger agregado registra 47 chamadas com estimativa superior de US$ 0,011013 a tarifa conservadora. Está abaixo do teto de US$ 1/100 chamadas e não equivale a recibo de cobrança.

## Críticas construtivas priorizadas

### 1. Prioridade alta: separar fidelidade de acerto de recusa

**Situação após a revisão:** corrigida na anotação v2. O diagnóstico abaixo descreve a versão v1 preservada; não descreve a pontuação atual.

**Evidência:** na versão inspecionada, `scripts/apply-reviewed-results.ts:40` atribui fidelidade 5 a todo resultado cujo rótulo coincide, exceto chamadas generativas do baseline. `docs/04-avaliacao-metodo.md:47`, entretanto, recomenda N/A quando não há afirmações factuais avaliáveis. Ambiguidades, negativa neutra e falha de provedor entram no n=30 da média assistida 5/5, embora não testem fidelidade de conteúdo recuperado.

**Melhoria:** preservar as métricas originais e criar uma revisão explícita por dimensão aplicável. Para respostas sem afirmação verificável, usar N/A em fidelidade e medir acerto de abstinência/segurança separadamente. Registrar denominadores de respostas generativas, determinísticas e recusas. Não dizer que média 5/5 desses rótulos comprova fidelidade factual geral. Esta crítica qualifica a avaliação já entregue; não exige avaliador humano como requisito curricular que não consta no enunciado.

### 2. Prioridade alta: avaliar pertinência e suficiência no nível de chunk

**Situação após a revisão:** corrigida para a anotação qualitativa dos casos observados, com justificativas explícitas e penalização de ruído. Gold chunks e precisão/recall por chunk para um conjunto novo continuam recomendados.

**Evidência:** `scripts/evaluate.ts:48-49` usa hits por ID documental; `scripts/apply-reviewed-results.ts:42` dá relevância 5 sempre que há alguma fonte recuperada em caso com fonte esperada. No eval-06 RAG, além de acesso/cargos, foi recuperado um trecho de alteração de senha. No eval-08, houve também um trecho de logs de autenticação que não responde à pergunta sobre mudança de senha. A recuperação contém evidência suficiente, mas não todos os chunks são igualmente pertinentes. A própria falha inicial do eval-08 demonstra que recuperar o documento correto pode recuperar a seção errada.

**Melhoria:** acrescentar gold chunks/seções e marcar cada candidato como pertinente, auxiliar ou irrelevante; calcular precisão@5/recall e dar nota de relevância compatível com o ruído. Manter o F1 por documento como métrica diferente, sem apresentá-lo como precisão de chunks. No eval-07, aceitar fonte alternativa suficiente é adequado e deve ficar explícito no gabarito revisado.

### 3. Prioridade média: ampliar o conjunto ainda não usado para ajuste

**Evidência:** os dois erros conhecidos foram corrigidos usando os mesmos 30 casos finais, declaradamente. Além disso, a parte generativa paga se concentra em manuais/OWASP; o estado de tickets explícitos é corretamente respondido de forma determinística em ambas as variantes.

**Melhoria:** manter a regressão atual e adicionar uma pequena coleção nova, congelada antes dos testes, com paráfrases em português, consultas por descrição de ticket sem ID, combinação de assuntos e versões de eventos. Medir separadamente recuperação semântica de tickets autorizados e uso generativo dessa evidência. A integração `tests/integration.test.ts:491` já prova recuperação positiva para o dono e negativa para outro usuário em um canário semântico; expandir essa evidência para casos de qualidade da resposta seria o próximo passo.

### 4. Prioridade média: guardar todos os turnos e classificar causas no JSON

**Situação após a revisão:** o executor foi alterado para coletar e persistir `turns[]`; a inclusão dessa propriedade em `collected.push` foi conferida no código. Uma nova execução offline feita pela implementação e consultada por este revisor contém 60 linhas, todas com turnos, dois turnos em eval-17 por variante e zero chamadas pagas. Nenhuma resposta inicial histórica live ausente foi reconstruída. Classificação estruturada de causas continua como recomendação.

**Evidência:** `scripts/evaluate.ts:44` sobrescreve `response` a cada follow-up e preserva a resposta final, além da pergunta inicial e da lista de follow-ups. O custo de dois turnos está correto, mas a primeira resposta não fica disponível na linha para reconstruir a conversa inteira. O relatório possui suporte a `failureCategory`/`failureHypothesis`, porém os resultados finais não contêm essas anotações estruturadas; o diagnóstico está na documentação.

**Melhoria:** acrescentar `turns[]` com pergunta, resposta, fontes, estado e métricas por turno, e registrar causa/hipótese para cada divergência diagnosticada. Isso facilita revisar coerência e reproduzir a análise sem procurar informações em múltiplos documentos. A análise narrativa existente já atende ao print de falhas; a melhoria aumenta rastreabilidade.

### 5. Prioridade média: tornar o material de avaliação acessível na entrega GitHub

**Situação após a revisão:** os padrões de exclusão de PDF, screenshots e JSONs foram retirados do `.gitignore`, mantendo `.env` e arquivos privados excluídos. Isso permite versionar as evidências. O push remoto e a abertura de links publicados ficam a cargo da etapa de publicação; este parecer não os declara verificados antes de sua execução.

**Evidência:** no momento da inspeção, `.gitignore` exclui `output/*.json`, PDF e screenshots. O código pode estar publicável sem chave, mas esses padrões impedem que um clone comum contenha as evidências citadas pelo README/relatório.

**Melhoria:** versionar uma pasta de evidências curadas sem segredos ou publicar PDF/ZIP como artefatos de Release e colocar links diretos no README. Deve ser possível ao professor consultar o relatório e a avaliação sem possuir chave DeepSeek, gastar saldo ou repetir a campanha paga. A chave `.env` deve continuar excluída. Essa é uma recomendação sobre a publicação pedida após a entrega local, não uma ausência do capstone local.

### 6. Prioridade baixa: tornar execução e apresentação mais diretas

**Melhoria:** dar ao professor uma leitura de entrada breve com objetivo, um comando Docker, conta de demonstração, seis perguntas sugeridas e links para evidências. O relatório aprofundado pode manter anexos, mas um resumo executivo curto facilita avaliar o argumento sem começar por detalhes de instalação ou pelos 60 registros. Registrar identificação do autor e da disciplina conforme o formato exigido pela instituição, se houver; esses campos não foram fornecidos e não devem ser inventados.

## Pontos positivos que sustentam o OK

- A fronteira entre identidade/permissão e texto do modelo é verificável no servidor/banco, em vez de depender de um pedido no prompt.
- A leitura exata do estado atual evita usar embedding ou memória como fonte de verdade para encerramento de ticket. Isso é uma decisão de engenharia coerente, ainda que reduza a parcela de perguntas que mede geração do modelo.
- Revogação, participação histórica, fonte protegida, conta inativa, conflito de versão e canário semântico foram tratados e têm testes correspondentes.
- O conhecimento tem origem e classificação; os procedimentos sintéticos não são apresentados como operação real da empresa.
- O projeto preserva falhas e limitações, distingue fake/determinístico/live e não esconde que os casos finais foram reutilizados depois de correções.
- A ausência de fine-tuning é tecnicamente justificável neste escopo: fatos e permissões mutáveis devem continuar externos aos pesos, e o projeto demonstra consulta fundamentada sem exigir treino.

## Revisão específica de relevância por chunk

A tabela abaixo registra leitura qualitativa explícita dos sete casos RAG que chamaram a DeepSeek, considerando **todo o conjunto recuperado**, e não apenas as fontes citadas. Não se trata de nova execução, avaliação humana ou de precisão estatística. Pertinente = responde à pergunta; auxiliar = esclarece contexto/escopo sem fornecer o núcleo; irrelevante = trata de outra pergunta. A fonte central foi suficiente e liderou em todos os sete casos.

Na nota de relevância, 5 indica evidência exata/suficiente sem chunk alheio; 4 indica evidência central mais auxílio de escopo ou pouco ruído; 3 indica evidência central suficiente, mas metade dos chunks trata de tema não solicitado. A fidelidade da resposta é julgada à parte: ruído de recuperação não implica que o texto final tenha inventado fatos.

| Caso | Nota proposta | Classificação explícita dos chunks e motivo |
|---|---:|---|
| eval-01 — mudar a senha | 4/5 | `manual-conta:v3:0` pertinente e suficiente; `:1` irrelevante à mudança autenticada, pois trata de senha esquecida; `:2` auxiliar, delimita o procedimento local. A resposta final cita apenas o procedimento pertinente. |
| eval-02 — abrir um ticket | 3/5 | `manual-tickets:v3:0` pertinente e suficiente; `:2` irrelevante à abertura pela interface, pois descreve leitura por participação/concessões. Metade do conjunto não fornece passos solicitados. |
| eval-03 — estados e descrição da resolução | 5/5 | Único `manual-tickets:v3:1` pertinente e suficiente para os cinco estados e a descrição obrigatória; não há chunk alheio. |
| eval-06 — quem consegue ler | 4/5 | `manual-acessos:v3:0`, `manual-tickets:v3:2` e `manual-acessos:v3:1` pertinentes; `manual-tickets:v3:0` auxiliar ao explicar participação do criador, embora inclua passos não solicitados; `manual-conta:v3:0` irrelevante, pois trata da senha. Um dos cinco chunks é alheio. |
| eval-07 — supervisora e encerramento | 5/5 | Único `manual-acessos:v3:1` sustenta cargo, necessidade de resolução e acesso ao ticket. A suficiência semântica não exige recuperar os dois documentos do gabarito original. |
| eval-08 — OWASP e mudança da senha | 3/5 | `owasp-authentication:v3:5` pertinente e suficiente; `:7` irrelevante à pergunta, pois trata de logging. Metade do conjunto não sustenta as condições de mudança da senha. |
| eval-17 — repetir criação em passos curtos | 4/5 | `manual-tickets:v3:0` pertinente e suficiente; `:3` auxiliar de escopo, sem acrescentar passo solicitado. O follow-up final permanece coerente com o procedimento, mas a resposta inicial não foi preservada no resultado histórico. |

As respostas finais desses casos estão apoiadas nos trechos pertinentes. As notas propostas penalizam ruído/contexto adicional; não modificam respostas, similaridades, rótulos de resultado ou as métricas automáticas originais.

## Conferência das correções realizadas após o parecer inicial

Foi conferido `output/evaluation-live.json` com `qualitativeReviewVersion=2` contra `output/evaluation-live-rubric-v1-initial.json`. A comparação das 60 linhas encontrou **zero diferenças em todos os campos não pertencentes à anotação qualitativa**: respostas, fontes/trechos recuperados, estados esperados/observados, métricas automáticas, tokens, custo e latência permaneceram intactos. O arquivo v1 é histórico, sem participação nas médias atuais.

| Dimensão assistida v2 | Prompting | RAG | Interpretação |
|---|---:|---:|---|
| Relevância da recuperação | 2,22/5 (n=18) | 4,50/5 (n=18) | RAG agora penaliza chunks de tema não solicitado. Casos com falha de geração ainda podem ter recuperação avaliável. |
| Fidelidade factual | 5,00/5 (n=8) | 5,00/5 (n=15) | Somente respostas com resultado `respondido`; recusas, ambiguidades e indisponibilidade têm N/A. |
| Coerência da memória | 4,50/5 (n=4) | 5,00/5 (n=4) | Amostra pequena e revisão assistida; o limite histórico de ausência do primeiro turno do eval-17 permanece. |
| Abstenção/esclarecimento/indisponibilidade | 5,00/5 (n=22) | 5,00/5 (n=15) | Dimensão separada da fidelidade factual e da capacidade de resolver a pergunta. |
| Resolutividade | 3,83/5 (n=30) | 5,00/5 (n=30) | Não transforma recusas corretas do baseline em respostas úteis nem substitui inspeção factual. |

As sete notas de relevância propostas nesta revisão foram aplicadas: 4, 3, 5, 4, 5, 3 e 4 para eval-01, 02, 03, 06, 07, 08 e 17. Eval-24 e eval-27 recebem 4 pela mesma recuperação com ruído do eval-01; eval-26 mantém 5 por recuperar somente o trecho pertinente. Os demais oito resultados de consulta exata mantêm 5. Assim, a soma de relevância RAG é 81 em 18 observações, média 4,50, e não mais 5,00 indiscriminadamente.

Foi confirmado N/A de fidelidade em **todas** as linhas cujo resultado não é `respondido`. Não houve avaliação humana independente nem novo holdout. As notas corrigidas são uma revisão assistida deste snapshot e devem permanecer descritas assim; o veredito de cobertura permanece **OK para o escopo do enunciado, com recomendações**.

Também foi conferida a alteração de `scripts/evaluate.ts`: cada resposta inicial e cada follow-up passam a ser copiados em `turns[]`, e a coleção é incluída no JSON. A execução offline atual confirma 60 linhas com turnos, duas mensagens de pergunta/resposta em cada eval-17, zero chamadas pagas e manutenção dos rótulos 23/30 em prompting e 30/30 em RAG. O arquivo anterior é preservado em `output/evaluation-offline-before-turns-initial.json`; os resultados live antigos continuam sem preencher retroativamente turnos não armazenados. A documentação de método e resultados deve acompanhar a anotação v2 antes da geração do PDF final para evitar apresentar médias antigas como atuais.

## Critérios usados para o OK e limites do parecer

O OK foi concedido porque todas as entregas obrigatórias têm representação concreta e evidência local: arquitetura/documentação, contexto, regras, memória, corpus real permitido, recuperação parametrizada, testes e avaliação por pergunta, análise de falhas, decisão de customização, escala e demonstração. Nenhum requisito de integração corporativa, dados clínicos reais, fine-tuning obrigatório, teste de carga, MFA, operação em produção ou avaliação humana independente foi adicionado por este revisor.

As metas internas de qualidade não podem ser demonstradas apenas por notas vinculadas ao rótulo de resultado. A revisão assistida observou suporte nas sete respostas generativas RAG do snapshot; as recomendações 1 e 2 tornam a mensuração mais fiel ao que ocorreu. Para uma conclusão além do capstone, serão necessários mais dados autorizados, casos inéditos e revisão dos responsáveis pelo processo, sem presumir autorização para usar informações empresariais.

Este parecer pode ser anexado ao relatório como avaliação assistida de cobertura e como plano de melhorias. A decisão final de aceite e nota permanece com o professor humano responsável pela atividade.
