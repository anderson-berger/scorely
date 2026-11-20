# 0017: Grupo v2, escrito do zero ao lado do antigo

- Data: 2026-11-20
- Estado: aceita

## Contexto

O módulo de grupos ([grupos.md](../modules/grupos.md), GRP-01–71) acumulou comportamentos que o dono não quer: esporte, lista e fila, vagas e mínimo, cancelar e reabrir, horários, jogo extra e remarcar, lugares. Boa parte é do jogo, e não do grupo. Times e competição dependem desse jogo. Não há dados em produção.

Decidido com o dono em 2026-11-20: o grupo novo tem só `META`, `MEMBER` e, depois, `AGENDA`; sem esporte (vira filtro de um marketplace futuro). O antigo não é excluído ainda.

## Decisão

- **Módulo novo, lado a lado:** `groups-v2` na api e no web, `groups-v2.ts` nos contracts, doc `grupos-v2.md` com o prefixo `GRV`. Nada é copiado do antigo sem passar pelo doc novo.
- **Id público do grupo (GRV-08):** como o do usuário ([0011](0011-id-publico-do-usuario.md)), o grupo tem o uuid (chave do banco, nunca sai) e um código curto (8 caracteres, Crockford base32, `LOOKUP#GROUP2#PUBLIC#<code>`), o único na URL e na api. Tipos com marca: `GroupId` na api, `PublicGroupId` nos contracts. O código não é convite: o convite terá token próprio.
- **Sem colidir com o antigo:** rotas em `/v2/...`, itens em `GROUP2#<id>` e `LOOKUP#USER#<userId>#GROUP2`, e os schemas com o sufixo `V2` (`GroupV2Schema`). Os códigos de erro do catálogo são compartilhados (`GROUP_NOT_FOUND` serve aos dois).
- **A troca, quando o v2 cobrir o que se usa:** sai o módulo antigo (com times e competição, que são refeitos sobre a agenda), o `groups-v2` vira `groups`, o prefixo volta a `GROUP#`, as rotas perdem o `/v2` e a tabela é recriada. Os ids `GRV` continuam (o número não volta a ser usado, ADR 0010).

## Consequências

- Durante a convivência, há dois grupos no app, e os nomes provisórios (`V2`, `GROUP2`, `/v2`) aparecem no código.
- A troca é uma tarefa só, mecânica, sem migração de dados.
- Times e competição continuam no grupo antigo até serem refeitos.
