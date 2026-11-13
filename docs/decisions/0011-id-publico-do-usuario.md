# 0011: id público do usuário, separado do id do sistema

- Data: 2026-11-13
- Estado: aceita

## Contexto

O id do usuário (uuid) é a chave dele no banco (`USER#<id>`, participações, presenças, jogadores, times) e hoje também sai em toda resposta que lista pessoas: membros, lista do jogo, times, o dono do grupo e até o caminho da foto. Queremos poder convidar quem já tem conta sem passar o email (como o código de amigo da Steam).

## Decisão

Cada pessoa tem dois ids. O **do sistema** (uuid) fica só no banco e no token do login. O **público** (8 caracteres, Crockford base32, `LOOKUP#USER#PUBLIC#<code>`) é o único que a api devolve ou recebe. Ação sobre si mesmo usa o id do login; ação sobre outra pessoa recebe o público e a api traduz na entrada.

## Por quê

- A chave interna não vira parte da api: dá para mudar o código público (trocar, revogar) sem mexer em nenhuma chave do banco.
- Editar a si mesmo só pelo login garante que ninguém mexe no que é de outro trocando um id.
- O código curto serve para convite e busca, coisa que um uuid não serve.

## Consequências

- No banco nada muda de chave: participações, presenças e times continuam com o id do sistema. A tradução fica nos services, na entrada (público → sistema, um BatchGet nos lookups) e na saída (o `publicId` vem no perfil que os services já buscam para os nomes).
- Tipos com marca (`UserId` na api, `PublicUserId` nos contracts) para o compilador não deixar um passar pelo outro.
- Os contracts não conhecem o id do sistema. Check: `checks/contracts.test.ts` recusa `z.uuid()` em campo de pessoa (`id` do usuário, `userId`, `ownerId`, `people`, `pinned`, chaves de `positions`/`names`).
- Custa um GetItem/BatchGet a mais nas rotas que recebem pessoas de fora.
