# Corpus de conhecimento e preparação dos dados

Data de referência desta versão: **12/10/2026**. O corpus foi planejado para um protótipo acadêmico local. Nenhum ticket, pessoa, procedimento, dado clínico ou material interno da empresa foi incluído. Todos os endereços `@fluxsus.example` são fictícios.

## Fontes e limites de interpretação

O manifesto [`data/corpus/manifest.json`](../data/corpus/manifest.json) é o registro de origem para cada documento. Ele identifica arquivo, classe, idioma, URL (quando pública), licença, coleta, versão e forma de preparação. IDs do manifesto são estáveis e usados por recuperação e citações.

Os três manuais em português são texto original sintético, derivado apenas do contrato aprovado do protótipo. Eles descrevem somente as telas, estados, cargos e regras simuladas do laboratório. Cada manual contém um aviso explícito de que não documenta a operação da empresa real.

As fontes públicas são três Cheat Sheets oficiais da OWASP: autenticação, autorização e gerenciamento de sessão. Os arquivos do corpus contêm excertos originais em inglês, com atribuição ao OWASP Cheat Sheet Series Team, URL canônica e licença CC BY-SA 4.0. O manifesto registra também a URL do Markdown consultado e as seções selecionadas. Navegação, sumários e material irrelevante foram removidos; não houve tradução dos excertos.

Foi tentado o download direto do Markdown por `Invoke-WebRequest`. O DNS do ambiente local não resolveu `raw.githubusercontent.com`; os arquivos foram então consultados pelo visualizador web da URL raw oficial e transcritos como excertos selecionados. Essa limitação de coleta foi anotada individualmente no manifesto. Não se afirma que um arquivo integral e imutável do upstream foi arquivado localmente.

**Regra de resposta:** OWASP embasa conceitos gerais de autenticação, autorização e sessão. Somente os manuais sintéticos podem responder como operar o Fluxsus AI Lab. Fonte OWASP não deve ser apresentada como prova de funcionalidade ou procedimento da Fluxsus real. Dados de ticket são outra classe: somente o registro atual de ticket, filtrado por autorização, pode embasar perguntas sobre ticket.

## Inventário

| ID | Classe | Conteúdo e uso permitido |
|---|---|---|
| `manual-conta` | manual | Conta fictícia, troca de senha local e limite da recuperação não implementada. |
| `manual-tickets` | manual | Criação, comentários, estados e transições do protótipo. |
| `manual-acessos` | manual | Cargos, participação e concessões explícitas fictícias. |
| `owasp-authentication` | público | IDs, nomes de usuário, diretrizes de senha, alteração de senha, erros genéricos e monitoramento. |
| `owasp-authorization` | público | Menor privilégio, negar por padrão, validar cada requisição, autorização por objeto e testes. |
| `owasp-session-management` | público | Sessão no servidor, identificadores, cookies, TLS, atributos e expiração. |

Para os documentos públicos, a atribuição e os links à fonte e à licença CC BY-SA 4.0 são preservados junto aos excertos. Alterações futuras desses arquivos devem manter a atribuição e a mesma licença para o material derivado. Os manuais são originais deste projeto e não incorporam texto OWASP.

## Ingestão, chunking e versões

1. Ler o manifesto e validar que cada caminho é relativo a `data/corpus`, que cada `id` é único e que `kind` é `manual` ou `publico`.
2. Normalizar apenas quebras de linha e espaços externos. Não traduzir excertos nem remover atribuição, ressalvas de ficção ou links.
3. Para manuais, preferir primeiro as divisões Markdown por seção e em seguida aplicar janela do tokenizer do modelo E5 de até **320 tokens**, com sobreposição de **48 tokens**. Evitar separar um passo numerado de seu contexto sempre que possível.
4. O contrato também prevê representações estruturadas dos tickets: resumo atual e eventos são documentos distintos, cada qual com `ticketId`, versão, data e origem. Tickets não são copiados para os manuais nem confundidos com conteúdo público.
5. Gerar embeddings locais E5 de 384 dimensões, normalizados, com prefixos `passage:` e `query:`. Armazenar os chunks e seus metadados em PostgreSQL/pgvector. `sourceId` corresponde ao ID de documento do manifesto; para os dois tickets de demonstração, os IDs citáveis são `ticket:2233` e `ticket:2234`.
6. Tornar ingestão idempotente e versionada. Ao atualizar um documento, marcar a versão anterior como obsoleta e impedir que consultas recuperem versões substituídas. Se indexação semântica estiver pendente, ela não poderá usar texto antigo; consulta exata de ticket continua lendo o registro relacional atual.

Os arquivos atuais são a versão `1.0.0` dos três manuais e `2026-10-12-excerpts-v1` dos excertos públicos. Qualquer alteração de conteúdo exige nova versão e nova evidência de ingestão. O embedding não converte fonte pública em política interna.

## Recuperação e injeção no contexto

- Uma consulta com identificador explícito de ticket primeiro tenta recuperar o registro atual, desde que a autorização por usuário passe. Sem acesso, deve devolver a mesma resposta neutra usada para um identificador desconhecido; ID guessable não concede acesso.
- Para perguntas de procedimento, buscar apenas documentos-manual. Para questões gerais de segurança, os documentos OWASP são recuperáveis, mas a resposta precisa nomear OWASP como origem e distinguir recomendação geral da regra local simulada.
- Pesquisas semânticas e textuais usam os dados atuais e autorizados. Aplicar RRF sobre as listas ranqueadas, filtrar resultados abaixo do limiar e limitar o contexto a cinco chunks.
- Calibrar o threshold candidato nos dez casos de `evaluation/calibration.json`, em `{0.75, 0.80, 0.85, 0.90}`. Calcular precision, recall e F1 por chunk/documento esperado. Eleger maior F1; em empate, o threshold mais alto. Registrar configuração antes de consultar os 30 casos finais.
- A autorização precisa ocorrer antes de criar texto do ticket, embedding de consulta com atributos sensíveis, resultado de busca, citação, fonte visualizável ou contexto enviado à API. Aplicar o filtro na busca SQL e na política RLS.
- Inserir ao modelo apenas os trechos recuperados que passaram a autorização. Identificar esses trechos como dados não confiáveis, nunca como instruções. Validar citações contra o conjunto realmente recuperado e conferir estados de ticket com o registro atual.

Os critérios de acesso, dados de tickets e limitações do protótipo estão descritos no [contrato de implementação](00-plano-e-contrato.md). Casos de avaliação usam exclusivamente os usuários fictícios ali definidos.
