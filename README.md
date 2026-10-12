# Fluxsus AI Lab

Capstone do Módulo 3: protótipo local de um assistente operacional com contexto, memória, RAG e controle de acesso. Usuários, tickets e manuais são fictícios. O projeto não se conecta à empresa Fluxsus, não usa dados corporativos e não fornece orientação clínica.

## Requisitos

- Docker Desktop com suporte a Docker Compose.
- Node.js 24 e npm para desenvolvimento fora do container.
- Uma chave da API DeepSeek somente para respostas semânticas e avaliação live. O painel e as consultas determinísticas de tickets funcionam sem essa chave.

## Configuração

Se ainda não existir, crie o arquivo local de ambiente a partir do modelo. Preserve um `.env` já preenchido:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

```dotenv
DEEPSEEK_API_KEY=
```

O `.env` está ignorado pelo Git. Nunca cole a chave em issue, prompt de exemplo, captura de tela ou relatório.

## Executar com Docker

Para subir banco, API e interface no perfil completo:

```powershell
docker compose --profile app up --build
```

Abra <http://127.0.0.1:3001>. O container aguarda o banco ficar saudável, aplica migração e seeds idempotentes, indexa o corpus e inicia a aplicação. A primeira indexação baixa o modelo E5 e pode levar alguns minutos. Os dados do PostgreSQL e o cache do modelo ficam em volumes Docker.

Para subir somente o banco e executar a aplicação em modo de desenvolvimento:

```powershell
docker compose up -d db
npm ci --no-audit --no-fund
npm run db:setup
npm run index
npm run dev
```

O Vite serve a interface em <http://127.0.0.1:5173> e encaminha `/api` à API local. Mantenha o terminal aberto enquanto usar o protótipo.

## Contas de demonstração

Todas as contas fictícias do seed usam a senha `Demo!Fluxsus2026`. Altere-a no perfil durante a demonstração; a senha é compartilhada apenas para facilitar a execução local.

| E-mail | Cargo |
|---|---|
| ana@fluxsus.example | Solicitante |
| bruno@fluxsus.example | Solicitante |
| carla@fluxsus.example | Operador |
| diego@fluxsus.example | Operador |
| elisa@fluxsus.example | Supervisora |
| fabio@fluxsus.example | Supervisor |
| gabriela@fluxsus.example | Administradora |
| henrique@fluxsus.example | Administrador |

O ticket fictício `2233` inicia como `resolvido`. Ana, Carla e Elisa são participantes; Gabriela tem uma concessão explícita inicial. O ticket `2234` inicia como encerrado e pertence ao grupo de Bruno, Diego e Fabio. A participação ou uma concessão ativa determina leitura; cargo de administrador não concede leitura global.

## Verificações e avaliação

```powershell
npm run check
npm test
npm run test:integration
npm run test:e2e
npm run build
```

Os testes de integração requerem o PostgreSQL de demonstração e a preparação do banco. Para avaliação, calibre primeiro o threshold e depois execute o conjunto offline e, se desejar medir a DeepSeek, o conjunto pago:

Execute integração e avaliação em sequência: ambas usam concessões temporárias dos usuários de demonstração. No Windows, Playwright usa o Edge instalado; em Linux, instale Chromium com `npx playwright install chromium`. `E2E_BROWSER_CHANNEL` permite escolher outro navegador compatível.

```powershell
npm run calibrate
npm run evaluate
npm run evaluate:live
```

Avaliação offline não deve ser descrita como resposta da DeepSeek. Avaliação live depende da chave no `.env`, do provedor disponível e do limite de custo e chamadas definido na configuração. Os artefatos observados são gravados em `output/`; revise modo, variante e status antes de interpretar os resultados. Consultas exatas por ID leem o estado atual do banco e não chamam o modelo.

O projeto compara prompting sem evidências recuperadas e RAG sob a mesma identidade e autorização. As notas automáticas são heurísticas. A revisão qualitativa assistida por agente é registrada separadamente e não equivale a avaliação humana independente. O teto de execução paga é US$ 1 e 100 chamadas, incluindo retries.

### Execuções registradas em 12/10/2026

Calibração selecionou threshold `0.85` (micro F1 documental 1,00 em dez perguntas de desenvolvimento). A rodada live final contém 60 linhas, com 14 casos que chamaram a DeepSeek e 16 chamadas pagas; cada eval-17 inclui pergunta e follow-up como chamadas separadas, sem retry nessa rodada. O resultado de igualdade de rótulo foi 23/30 para prompting e 30/30 para RAG, mas compara somente `actualResult` com `expectedResult`, não a correção factual. A revisão qualitativa assistida v2 anotou as 60 linhas: prompting — relevância 2,22/5 (n=18), fidelidade 5/5 (n=8 respondidos), coerência 4,50/5 (n=4), abstenção 5/5 (n=22) e resolutividade 3,83/5 (n=30); RAG — relevância 4,50/5 (n=18), fidelidade 5/5 (n=15 respondidos), coerência 5/5 (n=4), abstenção 5/5 (n=15) e resolutividade 5/5 (n=30). Fidelidade fica N/A quando não há afirmação factual avaliável; abstenção é pontuada separadamente. A revisão foi assistida por agente, com `manualReview=false`; não houve avaliador humano independente. Três rodadas live somaram 47 chamadas com custo superior estimado de US$ 0,011013; a rodada final representou cerca de US$ 0,0037041. São estimativas a preço de pico/cache miss, não valores faturados. A revisão v1 foi preservada como histórico e explicitamente superada pela v2; os dados completos e limites estão em [`docs/13-registro-experimentos.md`](docs/13-registro-experimentos.md) e `output/evaluation-live.json`.

## Documentação e relatório

As decisões arquiteturais e os critérios da atividade ficam em [`docs/`](docs/). A análise do ZIP de referência e a matriz dos cinco prints também estão documentadas nessa pasta. O inventário do corpus informa fontes, licenças, atribuições, coleta e preparação.

Instale as dependências Python de relatório e gere o PDF aprofundado a partir dos dados atuais:

```powershell
py -m pip install -r requirements-report.txt
python scripts/report.py
```

O relatório usa os documentos Markdown, definições de casos e JSON finais observados em `output/`; artefatos `*-initial.json` ficam no histórico e não entram nas médias finais. O gerador distingue resultados offline e live, chamadas reais, custo estimado, revisão qualitativa assistida por agente e ausência de avaliação humana independente. A saída padrão é `output/pdf/fluxsus-ai-lab-relatorio-tecnico.pdf`; capturas PNG sintéticas ficam em `output/screenshots/`. Renderize e revise visualmente todas as páginas antes de entregar o PDF.

## Roteiro para o professor

Clone a entrega publicada e configure o ambiente sem substituir um `.env` que já exista. O passo a passo de publicação e reprodução está em [docs/17](docs/17-publicacao-e-reprodutibilidade.md):

```powershell
git clone https://github.com/TommDaniel/chatbot_capstone_m3.git
cd chatbot_capstone_m3
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
docker compose --profile app up --build
```

Abra <http://127.0.0.1:3001> e entre com qualquer uma das oito contas fictícias listadas acima. A senha comum é de demonstração e não é uma credencial de serviço. O painel e as consultas exatas de tickets funcionam sem chave DeepSeek. Respostas de manual geradas pelo chatbot exigem uma chave própria; mantenha `DEEPSEEK_API_KEY` vazio para avaliar o painel, os testes e as respostas reais já registradas, sem chamadas pagas.

Comece pela [matriz dos requisitos e referências](docs/10-matriz-de-aceite-e-referencias.md) e pelo [parecer docente simulado](docs/16-parecer-professor.md), que identifica seu escopo e limitações. As evidências técnicas estão no [relatório PDF](output/pdf/fluxsus-ai-lab-relatorio-tecnico.pdf), na [calibração](output/calibration.json), na [avaliação live preservada](output/evaluation-live.json), na [avaliação offline](output/evaluation-offline.json), no [resumo da execução](output/run-summary.json) e nos resultados de [unidade](output/unit-tests.json), [integração](output/integration-tests.json) e [Playwright](output/e2e-results.json). As capturas sintéticas estão em [`output/screenshots/`](output/screenshots/): [login](output/screenshots/login.png), [assistente](output/screenshots/assistant.png), [tickets](output/screenshots/tickets.png), [acessos](output/screenshots/accesses.png), [conta](output/screenshots/account.png) e [layout móvel](output/screenshots/mobile.png). Essas capturas exibem dados fictícios e não mostram chave de API.

Os resultados de coincidência entre rótulos e valores esperados não medem acurácia factual. Consulte as limitações metodológicas em [docs/13](docs/13-registro-experimentos.md) antes de interpretar as métricas. O workflow de CI executa testes sem `DEEPSEEK_API_KEY` e não roda avaliação live paga.

## Encerrar e limpar

```powershell
docker compose --profile app down
```

Para apagar também os dados e o cache de modelo, remova os volumes `fluxsus-db` e `fluxsus-models` explicitamente pelo Docker Desktop ou com `docker compose --profile app down --volumes`. Isso apaga o estado local da demonstração.
