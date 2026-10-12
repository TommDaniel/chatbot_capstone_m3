# Acesso, identidade, regras de tickets e memória

**Status:** política definida no contrato de implementação e sujeita à confirmação por testes de integração com PostgreSQL. Todos os usuários, conversas, tickets e conteúdos deste projeto são fictícios.

## 1. Identidade confiável

O login verifica e-mail e senha contra credenciais sintéticas. A senha é persistida como hash scrypt com salt por conta; nunca é registrada em mensagem ou log. Após autenticar, a API emite um token opaco aleatório e persiste somente sua representação de sessão no servidor. O browser recebe cookie HttpOnly, SameSite e Secure quando HTTPS estiver habilitado.

Para cada chamada privada, a API resolve a sessão e obtém do registro do usuário o ID, o cargo atual e o estado ativo. O `role` em JSON, query string, texto da conversa, cabeçalho arbitrário ou valor de interface não altera o papel de autorização. Mutations do browser validam mesma origem; payloads são validados antes de executar consultas. Logout invalida a sessão do lado do servidor.

O contrato usa quatro valores estáveis em API: `solicitante`, `operador`, `supervisor`, `administrador`. Rótulos em português na interface podem ser amigáveis, mas não definem regras. Contas inativas perdem acesso independentemente de concessões existentes.

## 2. Autorização por usuário, ação e recurso

Autenticar responde “quem é esta sessão?”. Autorizar responde “esta pessoa pode executar esta ação neste ticket, neste estado?”. A decisão combina o menor nível de cargo requerido para a ação com acesso ao ticket. Ser Administrador não implica leitura irrestrita dos tickets.

### Matriz de ações

| Operação | Solicitante | Operador | Supervisor | Administrador | Condições adicionais |
|---|---:|---:|---:|---:|---|
| Criar ticket | Sim | Sim | Sim | Sim | Usuário ativo; criador entra na participação |
| Ler metadados, eventos, comentários e fontes do ticket | Condicional | Condicional | Condicional | Condicional | Participação histórica ou concessão ativa |
| Comentar | Sim, com acesso | Sim, com acesso | Sim, com acesso | Sim, com acesso | Ticket não encerrado; autor entra na participação |
| Registrar andamento/transição | Não | Sim, com acesso | Sim, com acesso | Sim, com acesso | Apenas transições válidas; autor entra na participação |
| Resolver | Não | Sim, com acesso | Sim, com acesso | Sim, com acesso | Texto de resolução obrigatório; ticket em andamento/aguardando |
| Encerrar | Não | Não | Sim, com acesso | Sim, com acesso | Apenas ticket resolvido |
| Conceder/revogar acesso explícito | Não | Não | Não | Sim | Administração não devolve o conteúdo do ticket |
| Acessar fontes e histórico de conversa | Condicional | Condicional | Condicional | Condicional | Revalidar acesso atual a todas as fontes citadas |

**Acesso condicional:** `participant` significa criador ou pessoa que registrou comentário/evolução. A participação histórica permanece depois que uma concessão é revogada. Uma pessoa que só tinha concessão perde acesso quando a concessão torna-se inativa. Uma concessão de leitura pode ser aplicada mesmo a usuário de menor cargo: ela permite leitura, sem elevar as capacidades de alteração.

### Fluxo de estados

```text
aberto -> em_andamento -> aguardando -> em_andamento -> resolvido -> encerrado
em_andamento -> resolvido -> encerrado
aguardando -> resolvido -> encerrado
```

| Estado inicial | Próximos estados válidos | Regra de integridade |
|---|---|---|
| `aberto` | `em_andamento` | Registro inicial é criado junto com evento de abertura |
| `em_andamento` | `aguardando`, `resolvido` | Evolução precisa de conteúdo descritivo |
| `aguardando` | `em_andamento`, `resolvido` | Evolução documenta motivo/retomada/resolução |
| `resolvido` | `encerrado` | `content` da resolução já é obrigatório na transição para `resolvido`; não há transição reversa definida |
| `encerrado` | Nenhum | Somente leitura; eventos são append-only |

As transições são submetidas com `version`; se outra atualização já avançou a versão, a API responde conflito em vez de apagar um evento concorrente. Encerrar é proibido sem resolução prévia. A chave `version` e o timestamp dão suporte à ordem e à investigação da linha do tempo.

## 3. Imposição no servidor e no PostgreSQL

A aplicação usa uma credencial runtime sem atributos `SUPERUSER` ou `BYPASSRLS`. Uma credencial proprietária distinta executa migrações e seeds; segredo de migração nunca é carregado pela interface. Cada operação que lê ou altera registros privados abre transação, define localmente a identidade autenticada e encerra a transação. O uso `SET LOCAL` evita carregar o sujeito para a conexão que o pool reutilizará em outra requisição.

RLS é a segunda barreira para que uma consulta esquecida não torne linhas de outros usuários visíveis. Políticas devem cobrir tabelas derivadas do ticket, como eventos, mensagens e chunks; joins não devem permitir contornar a política da linha pai. Consultas de aplicação também expressam a condição de participação/concessão para que a intenção de acesso fique revisável. As duas proteções não substituem autenticação da API e não autorizam que a conta do runtime altere as próprias políticas.

PostgreSQL aplica default deny a uma tabela com RLS habilitada que não tenha política aplicável, mas o dono da tabela normalmente ignora RLS e superusuários/BYPASSRLS sempre a ignoram. Por isso, papel de runtime e papel proprietário são separados e o comportamento real da conta runtime é testado. [Documentação PostgreSQL sobre RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

Cada rota, fonte e ação administrativa é um ponto de aplicação da política. Listar todos os tickets não pode obter rows e filtrar somente depois no browser. Da mesma forma, o retriever e a busca textual não podem consultar o corpus global e confiar que o prompt descartará o resultado sensível. A autorização ocorre na consulta do banco, antes do trecho chegar à pipeline de geração.

## 4. Não revelar existência de ticket inacessível

Uma busca exata para um ID inexistente e uma busca para um ID existente mas sem acesso retornam a mesma mensagem neutra (“Não encontrei informações suficientes para essa pergunta”). Não devolvem status, título, tamanho do histórico, fontes nem indicação de que a permissão foi negada. As rotas de detalhes e `GET /sources/:id` usam resultado neutro equivalente para ID desconhecido e fonte indisponível ao usuário.

Essa decisão reduz inferência de existência, mas não tenta esconder todos os sinais temporais em um protótipo. A demonstração mostra a resposta neutra antes e depois de uma concessão administrativa. O endpoint de concessões pode retornar apenas metadados de permissão, e apenas à role Administrador; ele não transporta texto do ticket.

## 5. Memória de conversa

### Memória da sessão

Cada conversa possui mensagens persistidas com papel, texto, estado do resultado, referências de fonte e timestamp. Para a próxima chamada, são selecionadas no máximo as 12 mensagens recentes, em ordem temporal. Um cálculo conservador mantém orçamento estimado de 8.000 tokens de entrada. Se for necessário podar contexto, a pergunta atual e regras do sistema permanecem; saem pares completos de turnos antigos, não metades de uma interação.

As mensagens originais permanecem armazenadas enquanto a conversa existir no banco, mas não se presume que todas serão reenviadas ao modelo. A poda do prompt não equivale a política de retenção/exclusão do banco; limpeza de conversas continua sendo um tema operacional explícito, não uma promessa implícita do limite de contexto.

### Memória persistente do usuário

Entre sessões, só persistem preferências explícitas (preferência de resposta `curto` ou `detalhado`) e IDs recentes de ticket. Não persistir sumário livre, perfil inferido, condição de saúde ou fato de ticket como lembrança autoritativa. Quando a conversa retoma um ticket, o sistema carrega a linha e os eventos atuais novamente.

### Controle de memória e revogação

Antes de selecionar mensagens antigas, leia IDs de ticket associados à mensagem e reavalie se a pessoa ainda tem acesso a todos eles. Mensagem cujo conteúdo depende de ticket sem acesso é excluída do contexto e não serve de fonte. A resposta histórica pode ser exibida como conversa somente se os controles de fonte vinculada forem satisfeitos; a fonte original em si continua sendo validada novamente pelo endpoint.

O participante histórico retém acesso por definição do projeto, inclusive se a concessão adicional for revogada. Assim, para o participante, o ticket segue no contexto por permissão própria; para um usuário que só tinha a concessão, o conteúdo ligado ao ticket sai do contexto na chamada seguinte. Usuário desativado sempre perde acesso. Preferências não concedem acesso a registros.

## 6. Superfície de fontes e recuperação segura

Cada `Source` retorna identificador, título, tipo, excerpt e metadados de versão. Um ticket inclui `ticketId` e `version`; documentos públicos podem expor sua URL. A fonte aberta pela interface aciona novamente a API, que revalida sessão e acesso atual. O browser não consulta o banco direto.

Fontes citadas precisam ser subconjunto de `sourceIds` que a pipeline entregou ao modelo. Documento recuperado é dado não confiável: seu texto não pode substituir regra de sistema, solicitar privilégio, revelar documento adjacente nem mudar o estado do fluxo. A validação completa também checa se uma afirmação factual sobre ticket corresponde aos dados atuais.

## 7. Casos de abuso e testes de segurança

Os casos a executar e os achados concretos são registrados em [avaliação do sistema](04-avaliacao-metodo.md). Os casos mínimos de autorização são:

| Caso | Preparação | Tentativa | Resultado esperado |
|---|---|---|---|
| Forgery de role | Conta solicitante autenticada | Enviar `role: administrador` no corpo/mensagem | Role em sessão é usada; concessão/encerramento recusados |
| IDOR no ticket | Ticket sintético secreto de outro usuário | Consultar ID por detalhe, lista, chat ou fonte | Nenhum dado/texto sensível aparece nem chega ao provedor |
| Acesso explícito | Admin concede ao usuário B | B consulta ticket antes inacessível | B passa a recuperar fonte autorizada; cargo não muda |
| Revogação | B não participou | Revogar concessão; reaproveitar conversa/memória | Texto e evidência deixam de ser reusados; resposta neutra |
| Revogação pós-participação | B já comentou/evoluiu | Revogar concessão | Histórico de participação mantém acesso conforme regra declarada |
| Administrador sem participação | Admin autenticado, ticket alheio | Ler o ticket ou buscar fragmento | Negação; papel administrativo só permite administrar concessão por ID |
| Ticket encerrado | Ticket resolvido e acessível | Atualizar/alterar/comentar | API recusa mutation; leitura permanece válida |
| Confusão de prompt | Fonte contém instrução maliciosa | Recuperar trecho adversarial | Trecho permanece conteúdo; não altera regra de acesso ou papel |
| Pool de conexões | Requisições de A e B intercaladas | Reutilizar conexão do banco | `SET LOCAL` e transação impedem identidade vazada entre requests |

## 8. Referências de segurança

- OWASP Authentication Cheat Sheet: [autenticação](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html).
- OWASP Authorization Cheat Sheet: negação por padrão e validação a cada pedido de recurso. [autorização](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).
- OWASP Session Management Cheat Sheet: [sessões](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
- PostgreSQL: [row-level security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).
- OWASP publica a série Cheat Sheet sob licença Creative Commons Attribution-ShareAlike 4.0 International. [Licença e projeto OWASP](https://cheatsheetseries.owasp.org/).
