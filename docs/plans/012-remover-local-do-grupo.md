# 012 — Remover o local (`location`) do grupo, por enquanto

## Objetivo

Tirar o campo `location` (texto livre) do grupo: do contrato, da api e das telas. Ele volta mais tarde, numa task própria, já como objeto com coordenadas e escolhido no mapa. Até lá, o grupo não tem local.

## Fora de escopo

- O mapa e o novo formato do local (a task própria futura).
- Apagar o atributo `location` dos itens que já estão no banco (D2).
- Qualquer outra mudança da revisão da tabela Group (`sportId`, `Membership`, arquivar grupo).

## Decisões

- **D1. A entrada ignora `location`.** O campo sai do `CreateGroupInputSchema`. Como o `z.object` descarta chaves desconhecidas, um cliente antigo que mande `location` tem o grupo criado normalmente, sem o campo. Não há erro novo.
- **D2. Os dados antigos ficam no banco, mas não saem na resposta.** Grupos criados antes deste plano podem ter `location` gravado. O atributo **não é apagado**: assim a mudança pode ser desfeita, e a task do mapa pode aproveitar o texto como `name`. Para ele não vazar, o `forViewer` (`groups.deps.ts`) passa a omitir `location`. A view do convidado (`game.service.ts`) já escolhe os campos um por um, e só perde o `location` da lista.
- **D3. O `StoredGroup` não declara mais `location`.** O tipo segue o `GroupSchema`. O atributo antigo é tratado como dado desconhecido que o `forViewer` descarta.
- **D4. As chaves de i18n saem** (`validation.location.*` e `groups.location`) em pt-BR e en, para não ficar texto morto.

## Contrato

Em `@scorely/contracts` (`groups.ts`):

- `CreateGroupInputSchema`: sai `location`.
- `GroupSchema`: sai `location`.
- `GuestGameSchema.group`: sai `location: true` do `pick`.

Não há rota nova nem erro novo.

## Modelo de dados

| Item                  | Mudança                                                                                                           |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `GROUP#<id>` / `META` | o atributo `location` deixa de ser gravado; nos itens antigos ele fica onde está, sem ser lido nem devolvido (D2) |

Não há chave, lookup nem transação nova, e não há migração.

## Casos de comportamento

1. **Dado** um create com `location: "Quadra X"` no body, **quando** ele é válido no resto, **então** o grupo é criado, o item gravado não tem `location` e a resposta também não.
2. **Dado** um create sem `location`, **então** o grupo é criado como hoje.
3. **Dado** um grupo gravado com `location: "Quadra X"` (de antes deste plano), **quando** o membro lê o grupo (`GET /groups/{id}`), **então** a resposta não tem `location`.
4. **Dado** o mesmo grupo antigo, **quando** aparece em "meus grupos", **então** o item não tem `location`.
5. **Dado** o mesmo grupo antigo, **quando** o dono faz PATCH das camadas ou troca um convite, **então** a resposta não tem `location`, e o atributo continua no item do banco.
6. **Dado** o link do jogo (`GET /play/{token}`) do mesmo grupo antigo, **então** `group` não tem `location`.
7. **Manual:** a criação do grupo não tem mais o campo "Local". A página do grupo, a lista de grupos e o `/play` não mostram mais o local nem o separador `·` que vinha antes dele.

## Tarefas

1. **Contrato:** remover `location` dos 3 schemas. _Pronto quando:_ o typecheck aponta todos os usos (api e web). _Risco:_ baixo.
2. **api:** `forViewer` omite `location` (D2) e a view do convidado deixa de copiá-lo. _Pronto quando:_ casos 1–6 passam. _Risco:_ esquecer um caminho de resposta. Todos passam pelo `forViewer`, exceto o `/play`, que o caso 6 cobre.
3. **web:** tirar o campo da `GroupCreatePage` (data, payload, template), o local da `GroupPage`, da `GroupsPage` e da `PlayPage`, e as chaves de i18n (D4). _Pronto quando:_ typecheck e `locales.test.ts` verdes, mais o caso 7 no roteiro. _Risco:_ sobrar um separador `·` solto na `GroupsPage`.

## Perguntas que bloqueiam

Nenhuma. A D2 vale com ou sem dados reais em produção: o atributo antigo só não é exposto.

## Status

- [ ] 1. Plano — aguardando aprovação
- [ ] 2. Contrato
- [ ] 3. Testes
- [ ] 4. Implementação
- [ ] 5. Revisão
- [ ] 6. Entrega
