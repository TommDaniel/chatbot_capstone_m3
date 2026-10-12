# Plano aprovado e contrato de implementação

Registro anterior à implementação, 12/10/2026. Capstone local, integralmente simulado. O ZIP original permanece intacto. RTK.md foi referido nas instruções, mas está ausente neste workspace. As frases de status neste plano registram decisões e pendências naquele momento; resultados posteriores estão em `docs/13-registro-experimentos.md` e nos JSON finais de `output/`.

## Decisões

- TypeScript: API Fastify em `server`, interface React/Vite em `web`, contratos em `shared`. SDK OpenAI configurado exclusivamente para DeepSeek. Não há integração com a empresa nem assistência clínica.
- PostgreSQL 17 e pgvector 0.8.7: dados relacionais e embeddings no mesmo banco. Aplicação usa papel sem SUPERUSER/BYPASSRLS. Migração/seed usa credencial proprietária separada. Transações de usuário executam SET LOCAL da identidade; RLS e consultas explicitamente autorizadas defendem leituras. Não usar cargo fornecido no corpo da requisição.
- Login fictício com hash scrypt e sessão opaca persistida no servidor, cookie HttpOnly/SameSite e validação de Origin para mutações. Cookie Secure quando configurado para HTTPS. API e interface na mesma origem.
- Participação: criador ou autor de comentário/evolução. Concessão explícita ativa também permite leitura. Administrador não possui leitura global implícita. Participação histórica permanece após revogação de concessão; usuário desativado perde acesso.
- Hierarquia de ações: todos criam/comentam; operador ou superior evolui/resolve; supervisor ou administrador encerra; administrador gerencia concessões por ID conhecido. Histórico é imutável.
- Estados: aberto -> em_andamento; em_andamento -> aguardando ou resolvido; aguardando -> em_andamento ou resolvido; resolvido -> encerrado. Resolução exige texto. Encerrado é somente leitura.
- Embeddings locais E5 multilíngue/ONNX com Transformers.js: mean pooling, normalização L2, 384 dimensões, prefixos query/passage. Chunking por tokenizer: 320 tokens, overlap 48. Busca exata autorizada por ID usa dados atuais; semântica e full-text recuperam versões atuais, até 5 chunks, ranking RRF. Limiar inicial .80, calibrado em 10 casos antes de 30 casos finais.
- Histórico: 12 mensagens, limite conservador de 8.000 tokens estimados; pergunta/regras preservadas, remoção de turnos completos antigos. Preferências e IDs recentes são memória persistente; fatos são sempre recarregados. Mensagens associadas a tickets sem acesso são omitidas. Referências históricas nunca são fonte de fatos atuais.
- DeepSeek Flash sem thinking, JSON validado antes de entrega, max output 1024, timeout/retry limitado. Sem chave, consultas que precisam de geração avisam configuração pendente; consultas exatas determinísticas continuam disponíveis. Fake somente em testes explicitamente identificados. Orçamento pago US$1/100 chamadas, reservas conservadoras incluindo falhas e retries.
- Três fontes OWASP reais licenciadas CC BY-SA e três manuais fictícios. Fontes reais fundamentam segurança; somente manuais sintéticos descrevem funções do protótipo. Seeds: 8 usuários, 24 tickets, ID2233.
- Fine-tuning não será implementado. Avaliação compara prompting isolado e RAG; limitações registradas, sem afirmar resultados da DeepSeek antes de execução real. PDF deriva de evidências em `output` e documentação em `docs`.

## Contrato HTTP (prefixo /api)

Tipos: User `{id:string,name,email,role}`; role `solicitante|operador|supervisor|administrador`. Ticket `{id:number,title,description,category,priority,status,version,createdAt,updatedAt}`. Estados conforme acima. Campos de erro `{error:string}`. Todas as chamadas autenticadas usam cookie; POST/PUT/DELETE do browser usam mesma origem.

- POST `/auth/login` `{email,password}` -> `{user}`; GET `/auth/me` -> `{user,providerConfigured:boolean}`; POST `/auth/logout`.
- POST `/auth/password` `{currentPassword,newPassword}`. GET/PUT `/memory` -> `{preferences:{style:'curto'|'detalhado'},recentTicketIds:number[]}`; DELETE `/memory` limpa preferências/referências.
- GET `/tickets` -> `{tickets}`; POST `/tickets` `{title,description,category,priority}` -> `{ticket}`; GET `/tickets/:id` -> `{ticket,events}`. Event `{id,actorName,kind,content,fromStatus,toStatus,createdAt}`.
- POST `/tickets/:id/comments` `{content}`; POST `/tickets/:id/transition` `{status,content,version}` (409 em conflito). Ambos -> `{ticket}`.
- GET `/admin/users` -> `{users}`; GET `/admin/grants/:ticketId` -> `{grants}` com apenas metadados de concessões; POST `/admin/grants` `{ticketId,userId}`; DELETE `/admin/grants/:ticketId/:userId`. Não retornam conteúdo do ticket. Concessão não altera cargo.
- GET `/conversations` -> `{conversations:[{id,title,createdAt}]}`; POST `/conversations` -> `{conversation:{id,title,createdAt}}`; GET `/conversations/:id` -> `{messages}` com Message `{id,role,content,result,sources,createdAt}`. POST `/chat` `{message,conversationId?}` -> `{conversationId,messageId,answer,result,sources,requestId}`. O endpoint de produto não aceita seletor de estratégia; a comparação prompting/RAG pertence ao executor de avaliação interno e mantém a mesma identidade e os mesmos controles.
- Source `{id,title,kind:'manual'|'publico'|'ticket',ticketId?,version?,excerpt,url?}`. GET `/sources/:id` -> `{source}` com autorização atual. Result `respondido|ambiguo|sem_evidencia|indisponivel`.

## Direção de interface

Ambiente de operações hospitalares fictícias: azul petróleo #12566A, azul escuro #17364A, fundo branco #FFFFFF, superfície #F0F6F8, texto #223747, alerta #A64730. Source Sans 3 para leitura. Barra lateral compacta, lista de tickets e linha do tempo, chat com fontes expansíveis. Navegação: Assistente, Tickets, Minha conta, Acessos (administrador). Sem gráficos decorativos. Indicação permanente de dados fictícios. Interface responsiva, teclado e contraste acessíveis. O foco visual é a linha do tempo de andamento e suas fontes.

## Validação prevista

Vitest (unidade/integrado com PostgreSQL real), Playwright (fluxos reais), canários de dados restritos capturando prompts, 10 casos de calibração e 30 casos finais com dimensões/rubrica. No momento do plano, testes pagos estavam pendentes até configuração da chave; as execuções posteriores constam em [`docs/13-registro-experimentos.md`](13-registro-experimentos.md) e em `output/`. Documentar incidentes e correções observados. Docker app+db com saúde, cache de modelo e bind local. Não expor chave, hash ou credencial de migração pela API/interface.
