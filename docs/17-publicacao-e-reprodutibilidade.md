# Publicação e reprodutibilidade

Este documento descreve como consultar a entrega no GitHub e reproduzir a demonstração local usando apenas dados fictícios e as evidências preparadas para o capstone. O sistema é um protótipo; não utiliza dados empresariais nem deve ser interpretado como sistema clínico ou operacional.

## Obter o código e configurar

Para consultar a entrega, clone por HTTPS. O proprietário usa o remoto SSH indicado para publicar:

```powershell
git clone https://github.com/TommDaniel/chatbot_capstone_m3.git
cd chatbot_capstone_m3
```

O arquivo `.env` é local e ignorado pelo Git. Se ele não existir, crie-o a partir do exemplo; se já existir, preserve seu conteúdo. O painel, as consultas exatas a tickets, os testes e a CI funcionam sem chave. Respostas de manual geradas pelo chatbot dependem de uma chave DeepSeek própria; o professor também pode examinar as respostas reais já registradas nos artefatos, sem gastar saldo:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Com Docker Desktop e Docker Compose disponíveis, suba o banco, a API e a interface:

```powershell
docker compose --profile app up --build
```

A aplicação fica em <http://127.0.0.1:3001>. A porta é vinculada somente à interface local. As oito contas listadas no README e seus tickets são fictícios; a senha comum é destinada à demonstração. Para parar os containers, use `docker compose --profile app down`.

## Reproduzir testes localmente

Com Node.js 24 e Docker Compose, os comandos principais são executados em sequência:

```powershell
npm ci --no-audit --no-fund
npm run check
npm test
docker compose up -d --wait db
npm run db:setup
npm run index
npm run test:integration
npm run build
npx playwright install --with-deps chromium
npm start
```

Deixe `npm start` em execução em um terminal. Em outro terminal, aguarde `http://127.0.0.1:3001/api/health` responder e rode `npm run test:e2e`. Playwright usa um worker e grava o resultado em `output/e2e-results.json` e as capturas em `output/screenshots/`. A indexação inicial baixa o modelo E5 local. Os testes usam dados e provedores simulados e não chamam a API DeepSeek.

O workflow `.github/workflows/ci.yml` executa os mesmos passos num runner Ubuntu com Node.js 24, em sequência. Ele cria `.env` a partir do exemplo sem chave, inicia o banco de testes, prepara o schema e o índice, inicia a aplicação por `npm start`, espera o endpoint de saúde e roda E2E no Chromium. A variável `DEEPSEEK_API_KEY` fica vazia; o workflow não roda calibração nem avaliação live paga. O artefato `ci-evidencias` guarda somente os três relatórios de teste e as capturas produzidos no job. Os arquivos de avaliação DeepSeek já versionados são evidências da execução local anterior, separadas do resultado de CI. O estado de sucesso ou falha de cada execução é informado pelo GitHub Actions; este documento não antecipa resultados de execução.

## Evidências e limites dos resultados

O README aponta para o relatório PDF, calibração, resultados offline e live, resumo de execução, relatórios de testes e screenshots sintéticos. Os arquivos de saída documentam execuções já preservadas no projeto; a CI cria uma execução isolada e seus próprios artefatos. Calibração e avaliação offline podem ser refeitas com `npm run calibrate` e `npm run evaluate`. A avaliação live deve ser executada somente por quem aceita o custo e fornece uma chave local; ela não faz parte da reprodução automatizada.

As comparações registradas entre `actualResult` e `expectedResult` verificam rótulos de resultado, não a correção factual de cada resposta. Pontuações automáticas e revisão qualitativa assistida também têm limites descritos em [docs/13-registro-experimentos.md](13-registro-experimentos.md) e no [parecer simulado](16-parecer-professor.md). Leia os métodos e denominadores antes de interpretar os resultados como evidência de qualidade.

## Conteúdo publicado

O código, a documentação, os dados sintéticos, os JSONs de evidência, o relatório PDF e as capturas de tela foram preparados para compartilhar a entrega. As imagens representam somente contas, tickets e atividades fictícias; a chave de API não é exibida. Não publique `.env`, `node_modules`, `.cache`, diretórios temporários como `tmp/` e `test-results/`, nem o ZIP de referência ou pacote de submissão.

Os documentos públicos da OWASP usados no corpus mantêm as licenças, atribuições, links de origem e registros de preparação descritos em [docs/03-corpus.md](03-corpus.md) e `data/corpus/manifest.json`. Ao redistribuir esse material, preserve os avisos e condições de licença correspondentes; os manuais de operações e registros apresentados pela interface são originais e sintéticos.
