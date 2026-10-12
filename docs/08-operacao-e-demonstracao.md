# Operação local e roteiro de demonstração

Este projeto roda localmente com Node.js 24, PostgreSQL 17 com pgvector e Vite. A alternativa Docker inicia PostgreSQL e, se solicitado pelo profile `app`, a interface e a API. Os scripts detalhados da versão ficam no `package.json` e neste procedimento; qualquer mudança de comando deve ser acompanhada por este documento e pelo README.

## Pré-requisitos e inicialização local

1. Instalar Node.js 24 e npm. A geração de embedding local baixa/carrega os arquivos do modelo E5 na primeira execução; é necessário ter espaço em disco e acesso de rede inicial ao Hugging Face ou cache já baixado.
2. Se ainda não houver `.env`, criar uma cópia local de `.env.example` sem imprimir chave em terminal ou commit. O projeto já fornece valores locais para banco e DeepSeek; preencher `DEEPSEEK_API_KEY` somente no arquivo ignorado pelo Git.
3. Iniciar o banco:

   ```powershell
   docker compose up -d db
   ```

4. Instalar as dependências conforme o lockfile do projeto e executar migração + seed:

   ```powershell
   npm ci --no-audit --no-fund
   npm run db:setup
   npm run index
   ```

5. Iniciar API e interface em modo desenvolvimento:

   ```powershell
   npm run dev
   ```

6. Abrir `http://127.0.0.1:5173`. API local atende em `127.0.0.1:3001`, endpoint de saúde em `/api/health`; o proxy Vite mantém `/api` na mesma origem.

O comando `db:setup` aplica migração e insere usuários, tickets, eventos e concessões sem substituir IDs já existentes. `index` prepara/indexa corpus com versionamento. A conta `fluxsus_app` é a credencial runtime sem privilégios de proprietário; a migração/seed usa `fluxsus_owner`. O Docker Compose publica o banco apenas em `127.0.0.1:55432`. O container da aplicação, quando usado, configura hostname `db` e cache do modelo em volume persistente.

### Execução integral pelo profile Docker

Com `.env` existente, executar:

```powershell
docker compose --profile app up --build
```

O serviço `app` executa build, migração, indexação e inicialização; o volume do modelo mantém cache entre inícios. O healthcheck espera o endpoint `/api/health` e a inicialização dos embeddings pode demorar na primeira vez. A aplicação publica-se em `http://127.0.0.1:3001`.

Para desligar serviços sem excluir os volumes de banco/modelo:

```powershell
docker compose down
```

Os registros locais ficam no volume `fluxsus-db`; o material de embedding fica em `fluxsus-models`. Recriar/remover o volume do banco apaga as conversas e mutações demonstrativas.

## Acesso de demonstração

As oito contas são fictícias. A senha comum de laboratório semeada é `Demo!Fluxsus2026`; trocar imediatamente após login se for manter um ambiente local além da demonstração. Não reutilizar essa senha em outros serviços.

| E-mail | Cargo | Nota de seed |
|---|---|---|
| `ana@fluxsus.example` | Solicitante | Participa do ticket 2233 |
| `bruno@fluxsus.example` | Solicitante | Não participa nem recebe grant inicial do 2233 |
| `carla@fluxsus.example` | Operador | Participa do ticket 2233 |
| `diego@fluxsus.example` | Operador | Grupo de tickets alternado |
| `elisa@fluxsus.example` | Supervisora | Participa do 2233 e pode encerrá-lo após resolução |
| `fabio@fluxsus.example` | Supervisor | Grupo de tickets alternado |
| `gabriela@fluxsus.example` | Administradora | Tem concessão explícita para ler o 2233 |
| `henrique@fluxsus.example` | Administrador | Não tem acesso implícito ao 2233 |

No seed inicial, o ticket `2233` está `resolvido`, não encerrado, e tem participantes Ana, Carla e Elisa; Gabriela tem concessão explícita. O ticket `2234` está encerrado e pertence ao segundo grupo sintético. Os IDs e textos constam em `scripts/db-setup.ts`, e o corpus registra usuários e tickets sem conteúdo real.

## Roteiro funcional

Use o banco semeado e execute na ordem; estados/timestamps finais podem se alterar depois de mutações. A demonstração pressupõe API key para respostas generativas; sem ela, mostre a mensagem de configuração pendente e ainda valide consulta determinística a ticket.

1. **Pergunta de uso pessoal:** entre como Ana e pergunte “Como posso mudar minha senha?”. Confira que a resposta cita apenas o manual fictício de conta. A senha nunca é incluída no chat.
2. **Ticket que a usuária acompanha:** pergunte “O ticket 2233 já encerrou?”. O resultado correto na base inicial é resolvido, aguardando encerramento.
3. **Follow-up de contexto:** pergunte “Então está encerrado?” na mesma conversa; o assistente deve resolver “ele” pelo histórico recente, confirmar o estado atual em banco e não inventar encerramento.
4. **Negação de leitura:** encerre sessão, entre como Bruno e pergunte por 2233. A API deve retornar frase neutra e zero fonte; verificar canário não é encontrado no contexto enviado ao provider.
5. **Grant administrativo:** entre como Gabriela, conceda acesso explícito ao Bruno para 2233; Bruno não ganha role nova. Entre novamente como Bruno e repita a consulta: agora a fonte retorna estado atual.
6. **Revogação:** Gabriela remove a concessão. Bruno consulta novamente e deve receber a negativa neutra. Como Bruno não participou, a mensagem associada ao ticket não deve aparecer na janela reenviada ao provider.
7. **Atualização de estado:** para demonstrar uma mudança após a consulta anterior, use ticket sintético `2235` ou outro ticket inicial em andamento e, com participante que é Operador, registre resolução com texto. Em seguida, a Supervisora/participante Elisa encerra ticket já resolvido. Consulte o ID de novo: o assistente deve refletir `encerrado` ao invés do estado anterior.
8. **Painel de contas/memória:** altere preferência entre curto/detalhado, inicie conversa nova, confirme que preferência persiste; limpe memória e confira retorno à escolha padrão.

Após primeiro ciclo, não reexecutar as ações sem conferir estado dos tickets. O seed não reseta registros existentes, e uma transição encerrada não pode ser desfeita. Para demonstração repetível, use outro ID sintético não mutado ou banco de laboratório novo, preservando apenas dados descartáveis.

## Comandos de verificação

Os scripts a seguir são comandos definidos no package do projeto. Teste de integração exige PostgreSQL. Playwright pode solicitar instalação de browser no primeiro uso:

```powershell
npm run check
npm run test
npm run test:integration
npm run build
npm run test:e2e
```

Calibração e avaliação offline usam os casos JSON versionados. Resultados são escritos em `output/` conforme o runner final. Somente `evaluate:live` acessa DeepSeek; requer chave e tem custo limitado pela configuração definida.

```powershell
npm run calibrate
npm run evaluate
npm run evaluate:live
```

Antes de iniciar a opção live, conferir crédito e preços oficiais atuais, garantir teto de US$1 e até 100 chamadas/retries, e revisar o script para confirmar a reserva de budget. Uma execução live sem chave não gera resultado real; use o status pendente sem substituir por dado sintético. A metodologia, definição de scores e casos estão em [avaliação](04-avaliacao-metodo.md); os registros de execução ficam em `output/*.json`.

## Resolução de problemas

| Sintoma | Verificação |
|---|---|
| Login não entra | Confirmar e-mail `@fluxsus.example`, senha demonstrativa e `GET /api/health`; consultar seed sem registrar hash ou credencial de DB |
| UI carrega, API falha | Verificar `npm run dev`, porta 3001 e rota `/api`; confirmar regras `ALLOWED_ORIGIN` compatíveis com host usado (`localhost` ou `127.0.0.1`) |
| Banco indisponível | Consultar `docker compose ps` e healthcheck; o serviço publica em 55432 e deve estar saudável |
| Documento público não é buscado | Conferir se o modelo E5 baixou/cacheou e se `npm run index` concluiu; uma falha de indexação não deve usar versão velha silenciosamente |
| Resposta generativa não disponível | Verificar se `DEEPSEEK_API_KEY` foi colocada em `.env` no servidor, sem revelar seu valor; reiniciar serviço após editar |
| Consulta ao 2233 diz resolvido | Estado inicial previsto: `resolvido`; é diferente de `encerrado`. Verifique se uma demonstração anterior já o encerrou |
| Avaliação não mostra as tabelas finais | Verificar artefatos reais em `output/`; casos planejados em `evaluation/` não são resultados de execução |

## Segurança operacional para a atividade

`.env` e credenciais de runtime/owner são ignorados pelo Git. A chave DeepSeek nunca pode ser exposta por UI ou endpoint. Não inserir export de tickets real, material de saúde/paciente, nome real de hospital ou texto corporativo. O conteúdo de tickets exemplo menciona somente instituição explicitamente fictícia. A captura de tela deve remover endereço e qualquer dado pessoal do ambiente antes de ser anexada; as screenshots destinadas ao PDF devem ser criadas a partir da interface sintética e ficam em `output/screenshots/`.

