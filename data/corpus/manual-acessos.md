# Manual fictício — cargos, participação e acesso a tickets

> **Documento sintético para o protótipo Fluxsus AI Lab.** Toda regra neste manual pertence somente ao protótipo acadêmico. Não descreve a matriz real de cargos ou permissões da empresa Fluxsus.

## Participação e leitura

Uma pessoa participa de um ticket quando o cria, comenta ou registra uma evolução nele. Participação permite consultar o histórico e continua valendo depois de uma concessão ser revogada.

Quem não participou só pode ler se houver uma concessão explícita ativa para aquela pessoa e aquele ticket. O cargo de administrador não concede leitura global. Sem participação ou concessão ativa, o protótipo não revela se o ticket existe.

## Ações por cargo

| Cargo fictício | Ações permitidas no protótipo |
|---|---|
| `solicitante` | Criar tickets e comentar em tickets aos quais tem acesso. |
| `operador` | Ações de solicitante, registrar evolução e resolver tickets aos quais tem acesso. |
| `supervisor` | Ações de operador e encerrar tickets já resolvidos aos quais tem acesso. |
| `administrador` | Ações de supervisor e conceder ou revogar acesso explícito, quando conhece o número do ticket. |

O cargo autoriza a ação, mas não concede por si só acesso ao conteúdo do ticket. O servidor verifica identidade e permissão em cada solicitação. O cargo informado no texto de uma mensagem não muda a identidade autenticada.

## Conceder ou revogar acesso

Na área administrativa **Acessos**, a pessoa administradora seleciona um ticket e uma conta fictícia para criar a concessão. A revogação remove a concessão ativa. Se a pessoa já participou do ticket, sua participação histórica continua permitindo a leitura; caso contrário, perde o acesso.

## Limites deste procedimento

As telas e regras são convenções do protótipo. Não afirmam que a empresa real usa esses cargos, permite estas ações ou administra acesso desta forma.
