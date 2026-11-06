# Revisão: docs/plans/007-grupos-e2.md (bloco 1: contrato + api, tarefas 1 e 3–7)

**Veredito:** aprovado com ressalvas (sem ❌)

## ✅ Respeitou

- D4/D5: entrada de membro ou reserva = lookup do papel + `LOOKUP#USER#<u>#GROUP` numa transação, com `attribute_not_exists`; reserva → membro = Delete do lookup de reserva + Put do de membro na mesma transação (`group.repository.ts:93-110`, `:222-237`).
- Troca de link: Delete do antigo + Put do novo (`attribute_not_exists`) + Update do grupo condicionado ao token antigo; sem token antigo, só o Put (D6) (`group.repository.ts:113-136`).
- Remoção (D10): lookup do papel, "meus grupos", presença e troca do link daquele papel numa transação (`group.repository.ts:284-300`).
- Grupo novo: entidade + 3 lookups de token + 2 do dono numa transação, com o `createdAt` da entidade; `newEntity` e `stripKeys`.
- Erros novos nos 4 lugares; mensagens em inglês, sem dado pessoal.
- Rotas novas em `authHandlers`, `userId` de `auth.userId`; check:rules verde.
- D8 (`myOpensAt` por camada, `GAME_LIST_NOT_OPEN` com a abertura da camada), D3 no service (`reservesHours`), D11 (PATCH junta e valida com `GroupLayersSchema`).
- Contrato igual ao do plano; lacunas fechadas registradas no plano.

## ❌ Violou

(nada)

## ⚠️ Precisa de você

- Dois `PATCH` ao mesmo tempo podem gravar uma ordem de camadas inválida: a ordem é conferida na leitura e o `UpdateCommand` só exige `attribute_exists(PK)` (`group.repository.ts:268-280`).
- Convidado já confirmado não consegue desistir pelo link se o dono desligar os convidados ou trocar o link (`byGuestLink` → `GAME_LINK_INVALID`). Decisão implícita.
- `acceptInvite` com remoção simultânea pode devolver `myRole` sem a pessoa participar (`group.service.ts:145`). Corrida rara.
- Lookups criados na troca de token usam a hora atual como `createdAt` (item novo; correto).

## Testes

Casos 1–15 em `groups.service.test.ts:987-1583` e `zoned.layers.test.ts:14-24`. Caso 12 só no repositório em memória (transações conferidas na leitura e no smoke do LocalStack). Caso 16 fica para o bloco 2. Nenhum teste alterado depois de staged.

## npm run check

Verde. O aviso de lint `useOptionalChain` (`game.service.ts:185`) foi corrigido depois da revisão.
