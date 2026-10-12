# Verificação de segurança e regressões

**Status:** critérios executados em 12/10/2026. Esta suíte usa somente dados sintéticos e um gerador falso. Nenhum teste deste documento chama a API da DeepSeek.

## Objetivo

Verificar que autorização permanece válida ao consultar tickets, mensagens, fontes e memória, inclusive depois de revogar uma concessão; que documentos recuperados não ganham autoridade sobre as regras; e que o contexto e as citações têm limites previsíveis.

## Critérios de regressão

| Área | Cenário | Critério de aprovação |
|---|---|---|
| RLS de mensagens | Usuário sem participação perde uma concessão após uma conversa ligada ao ticket | `SELECT` e endpoint de histórico não devolvem mensagens cujos `ticket_ids` perderam autorização |
| RLS de escrita | Papel runtime tenta inserir mensagem com `ticket_ids` de ticket inacessível | A policy de `INSERT` recusa a linha antes de persistir o conteúdo |
| Memória após revogação | ID de ticket lembrado deixa de ser legível | ID não é reapresentado como contexto; follow-up não revela texto histórico |
| Fontes | Abrir fonte de ticket permitida, negada ou inexistente | Só a fonte autorizada retorna conteúdo; negada e inexistente não revelam dados |
| Recuperação semântica | Canário de ticket privado semelhante à pergunta | `retrieve` não retorna o canário e o JSON de evidências do prompt não o contém |
| Identidade | Conta desativada ou papel falsificado | Sessão da conta inativa é recusada; papel enviado pelo cliente não altera autorização |
| Citações | Citar ID não recuperado, omitir fonte de resposta factual ou mencionar ticket fora das fontes | Resposta é rejeitada antes de ser mostrada |
| Fidelidade de estado/data | Gerador cita um ticket autorizado, mas contradiz seu estado atual ou inventa data de atualização | Resposta contraditória é rejeitada antes de ser mostrada |
| Contexto | Histórico longo ou grande; pergunta atual e regras permanecem | No máximo 12 mensagens recentes, teto conservador de 8.000 estimados e falha explícita se pergunta/regras não couberem |
| Privacidade | Canary atravessa recuperação, montagem de contexto e gerador falso | Texto e identificador do ticket privado não aparecem nas fontes passadas ao gerador |

## Execução e evidências

- `npm test -- --reporter=json --outputFile=output/unit-tests.json` executa somente unidades, sem banco nem API externa.
- `npm run check` valida tipos de aplicação e testes.
- `npm run test:integration -- --reporter=json --outputFile=output/integration-tests.json` executa integração contra PostgreSQL local e conta runtime com RLS.
- Testes de integração usam gerador falso e fixtures temporárias identificadas por UUID; restauram concessões de seed e removem seus registros após cada caso.
- Testes semânticos usam o modelo local de embeddings e PostgreSQL; são offline quanto à geração. Se o modelo não estiver disponível localmente, o caso é marcado como dependente da configuração local e não substituído por resultado inventado.

Os relatórios JSON são artefatos de execução, não evidência de avaliação paga nem de qualidade do provedor. Falhas devem permanecer visíveis, com causa atribuída a autorização, recuperação, contexto, geração ou ambiente.

## Resultado da execução

| Verificação | Resultado | Observação |
|---|---:|---|
| `npm run check` | Aprovado | TypeScript sem erros |
| Testes unitários | 11/11 | Hashes, transições, montagem e limite de contexto, citações e consistência de estado/data |
| Testes de integração | 18/18 | PostgreSQL local, conta runtime com RLS, fake generator e fixtures sintéticas |
| Testes de interface | 3/3 | Playwright no Edge, contra a aplicação Docker final; sem chamadas pagas |
| Canary semântico | Aprovado | Usuário Bruno recuperou o ticket sintético próprio; Ana não recebeu o chunk privado na recuperação. Sem evidência elegível, o chat se absteve antes de chamar o gerador |
| Escrita RLS de mensagens | Aprovado | Inserção direta pela role runtime com referência inacessível foi recusada |

Os resultados completos estão em `output/unit-tests.json` e `output/integration-tests.json`. A validação foi local e não consumiu chamadas nem saldo da API DeepSeek. A calibração separada do threshold selecionou `0,85`, com micro-F1 de `1,00` nos dez exemplos de desenvolvimento; essa métrica descreve apenas aquele conjunto pequeno e não demonstra desempenho geral.
