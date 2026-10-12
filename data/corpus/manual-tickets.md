# Manual fictício — criação e acompanhamento de tickets

> **Documento sintético para o protótipo Fluxsus AI Lab.** O vocabulário e os passos abaixo existem apenas para demonstração acadêmica, sem dados ou confirmação de processos reais da empresa Fluxsus.

## Criar uma solicitação

1. Entre com uma conta fictícia e abra **Tickets**.
2. Escolha **Novo ticket**.
3. Preencha título, descrição, categoria e prioridade com informação fictícia.
4. Envie a solicitação. O protótipo atribui um número e inicia o ticket no estado `aberto`.

O criador passa a ser participante do ticket. Use comentários para acrescentar informação ou fazer uma pergunta; cada comentário fica registrado na linha do tempo.

## Acompanhar o andamento

Os estados usados no protótipo são `aberto`, `em_andamento`, `aguardando`, `resolvido` e `encerrado`.

- `aberto` pode avançar para `em_andamento`.
- `em_andamento` pode avançar para `aguardando` ou `resolvido`.
- `aguardando` pode voltar para `em_andamento` ou avançar para `resolvido`.
- A resolução exige que o operador registre uma descrição da resolução.
- Um supervisor ou administrador pode encerrar um ticket já resolvido, se tiver acesso a ele.
- Um ticket `encerrado` fica disponível apenas para consulta.

Cada atualização informa quem a registrou e aparece na linha do tempo. O assistente deve consultar o registro atual para responder sobre o estado; uma resposta anterior da conversa não substitui o ticket atualizado.

## Acesso às informações

É possível ler um ticket se a pessoa participou dele ou se um administrador concedeu acesso explícito ainda ativo. Ter cargo de administrador, por si só, não libera leitura de todos os tickets. Detalhes dos cargos e das concessões estão no [Manual fictício — cargos e acesso a tickets](manual-acessos.md).

## Limites deste procedimento

Os nomes de telas, campos, estados e regras acima foram criados para o protótipo. Eles não confirmam categorias, prioridades, prazos, fluxos, permissões, funcionalidades ou terminologia de qualquer plataforma real.
