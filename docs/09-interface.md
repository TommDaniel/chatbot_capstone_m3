# ADR 09 — Interface do Fluxsus AI Lab

**Status:** aprovado para implementação  
**Data:** 12/10/2026

## Decisão

Construir uma aplicação React, TypeScript e Vite em `web/`, servida na mesma origem da API por meio do proxy `/api`. A interface será em português do Brasil e apresentará somente registros sintéticos. A identidade vem da sessão autenticada, nunca de campos editáveis do navegador ou da conversa.

## Direção visual

- Paleta de operações: azul petróleo `#12566A`, azul profundo `#17364A`, fundo `#FFFFFF`, superfície `#F0F6F8`, texto `#223747` e alerta `#A64730`.
- Source Sans 3 como família tipográfica única, com hierarquia clara entre títulos, texto e metadados.
- Layout de aplicação: navegação lateral compacta em telas largas; cabeçalho com usuário e estado do ambiente; conteúdo de leitura alinhado à esquerda. Em telas estreitas, navegação vira uma barra inferior e colunas tornam-se sequenciais.
- A conversa e suas fontes formam a principal área de trabalho. Na visão de tickets, a lista dá lugar ao detalhe e à linha do tempo; ações permitidas aparecem junto ao estado relevante.
- Dados fictícios permanecem sinalizados no cabeçalho e nas telas autenticadas. Não há gráficos decorativos nem conteúdo clínico.

## Estrutura e interação

- Login identifica a sessão e mostra erro específico sem expor credenciais. O usuário pode entrar com uma das oito contas sintéticas de demonstração.
- Assistente lista conversas, cria uma conversa e apresenta histórico, respostas, resultado e fontes com opção de consultar o material autorizado. Sem chave DeepSeek, consultas de geração mostram configuração pendente; respostas determinísticas que a API disponibilizar podem continuar visíveis.
- Tickets permitem filtrar e abrir somente os registros retornados pela API. O detalhe organiza descrição, estado e eventos em uma linha do tempo; criação, comentário e transições seguem os controles da API e a versão retornada. Conflito de versão pede atualização e reapresenta o estado atual.
- Minha conta permite trocar senha, salvar preferência de resposta (`curto` ou `detalhado`) e limpar memória persistente.
- Acessos aparece somente para administradores e permite selecionar usuário e ticket conhecido para conceder ou revogar acesso. A tela exibe metadados de concessão, sem conteúdo do ticket.

## Acessibilidade e estados

Usar landmarks semânticos, rótulos associados, controles nativos, ordem de foco previsível, foco de teclado visível, anúncios de sucesso/erro via região viva, contrastes legíveis e respeito a `prefers-reduced-motion`. Toda ação assíncrona terá estado de carregamento, erro recuperável e confirmação perceptível. Listas vazias indicarão como começar; botões indisponíveis terão a razão explicada.

## Consequências

As chamadas usam `fetch` para `/api` com `credentials: 'include'`; erros HTTP viram mensagens simples, sem renderizar corpos não confiáveis. Toda autorização permanece no servidor. A composição fica concentrada em componentes React pequenos e sem biblioteca visual, para não acoplar o protótipo a um kit de componentes. Vite usa `web/` como root, emite para `dist/web` e encaminha `/api` a `127.0.0.1:3001`.

## Validação visual prevista

Verificar largura ampla e móvel, navegação completa por teclado, sessão expirada, usuário sem permissão de administrador, sucesso e falha das principais mutações, além da indisponibilidade de configuração do provedor. Construção e checagens automatizadas serão executadas quando os scripts/dependências do workspace estiverem disponíveis.

## Contratos verificados na interface

- A mensagem do chat respeita o limite da API de 2.000 caracteres; títulos de ticket exigem 5 caracteres, comentários e transições exigem 3, a resolução exige 10 e a nova senha exige 12.
- A atualização da memória envia somente preferências. Os IDs recentes continuam sendo referências geradas pelo servidor e não podem ser forjados pelo navegador.
- A tela administrativa exibe apenas concessões ativas, embora a API retenha registros revogados para auditoria.
- Modais posicionam o foco no primeiro campo, mantêm a navegação por Tab dentro da janela, fecham com Escape e devolvem o foco ao controle que os abriu.

## Automação E2E

`tests/e2e.spec.ts` usa o navegador Edge contra a aplicação e a API reais em `http://127.0.0.1:3001`. Execute `npm run test:e2e`; para selecionar Edge explicitamente, defina `E2E_BROWSER_CHANNEL=msedge`. A suíte valida login e troca de identidade, consulta determinística do ticket 2233 e follow-up, acesso negado, criação e comentário, as transições por papel, concessão e revogação, preferências persistentes e a navegação móvel. As consultas usam somente IDs exatos e verificam que nenhuma chamada é feita à API paga da DeepSeek.

Os testes criam um ticket com título marcado `E2E temporário`, conversas e sessões isoladas. No encerramento, removem somente os registros criados pela execução e restauram as memórias anteriores de Ana e Bruno. Capturas ficam em `output/screenshots/`; traces e imagens de falhas ficam em `test-results/e2e/`. A API aplica limite de 10 logins por minuto; mantenha uma janela limpa antes de executar a suíte novamente após tentativas interrompidas.
