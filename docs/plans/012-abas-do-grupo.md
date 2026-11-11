# 012 — Página do grupo em abas (Jogo · Membros · Ajustes)

Pedido do dono (2026-11-09): hoje, ao entrar num grupo, tudo fica numa rolagem só: o jogo da semana, a abertura em camadas, os links e os membros. Fica misturado e confuso. Das propostas apresentadas, o dono escolheu a **A**: abas com rota própria.

## Objetivo

Separar a página do grupo em três assuntos, cada um numa aba com sua própria URL:

| Aba     | Rota                   | Quem vê   | Conteúdo                                                                                                   |
| ------- | ---------------------- | --------- | ---------------------------------------------------------------------------------------------------------- |
| Jogo    | `/groups/:id`          | todos     | placar ou contagem regressiva, confirmar/desistir, uma linha sobre a abertura em camadas, Escalação, Banco |
| Membros | `/groups/:id/members`  | todos     | membros do grupo e papéis, remover (dono), botão "Convidar" (dono)                                         |
| Ajustes | `/groups/:id/settings` | só o dono | abertura da lista (resumo e editor), os 3 links (copiar e gerar outro), cancelar o jogo                    |

A `GroupPage` vira o casco: carrega grupo, jogo e membros, mostra o cabeçalho e as abas fixas no topo, e concentra as ações (confirmar, desistir, cancelar, gerar link, remover). As abas são páginas filhas que recebem os dados por props e devolvem as ações por eventos. Quando chegarem os **times (E3)** e as **partidas (E4)**, eles entram na aba Jogo como seções novas. Se crescerem demais, viram uma quarta aba, sem reestruturar de novo.

O comportamento não muda: as mesmas chamadas à api, as mesmas regras de fila, de camadas e de permissão do dono.

## Fora de escopo

- Times, partidas e MVP (E3–E5). Aqui só fica o lugar reservado para eles.
- Mudanças na api ou no contrato.
- Tela de convite antes do login (continua fora, como no plano 008).
- Novo visual: o tema Placar (plano 008) continua como está.

## Decisões

| #   | Decisão                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Por quê                                                                                                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Rotas filhas** de `groups/:id`: `''` → `group` (Jogo), `members` → `group-members`, `settings` → `group-settings`. O nome `group` continua sendo o da aba Jogo.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | o voltar do celular funciona entre abas e dá para mandar o link de uma aba. Os `{ name: 'group' }` que já existem (Home, `playRedirect`, notificações, Join) continuam caindo no jogo, sem mudança |
| D2  | O **casco** (`GroupPage`) carrega os dados uma vez (`get`, `currentGame`, `members`, como hoje) e passa para a aba pelo `<router-view v-slot="{ Component }">`. As ações ficam no casco (`run`, `ask`, os `$q.dialog` atuais) e as abas emitem eventos (`confirm`, `leave`, `cancel`, `rotate`, `remove`, `saved`). Trocar de aba não recarrega nada.                                                                                                                                                                                                                                                                                                                                          | um ponto só de carregamento e de erro. As abas ficam simples e o comportamento de hoje (recarregar depois de cada ação) é mantido                                                                  |
| D3  | Abas com `q-tabs` + `q-route-tab`, fixas no topo (`position: sticky`) logo abaixo do cabeçalho. A aba Ajustes só aparece para o dono. Lista das abas visíveis numa função pura, `groupTabs(isOwner)`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | componente nativo do Quasar com rota; a regra de quem vê o quê fica testável                                                                                                                       |
| D4  | **Ajustes para quem não é dono**: quando os dados carregam e a rota é `group-settings` sem ser dono, `router.replace` para `group`. Decisão numa função pura, `tabRedirect(routeName, isOwner)`. A api continua barrando as ações de dono, como hoje.                                                                                                                                                                                                                                                                                                                                                                                                                                          | o link pode ter sido repassado; é melhor cair no jogo do que numa tela vazia                                                                                                                       |
| D5  | **Linha de abertura na aba Jogo** (para todos, inclusive o dono), embaixo do botão de confirmar: diz qual é a próxima camada a abrir e quando. Exemplos: "Reservas entram a partir de qui 18:00", "Convidados entram a partir de sex 13:00", "Lista aberta para todos". Não aparece com o jogo cancelado ou em andamento. Usa a função pura `nextLayer(game, now)`: a primeira de `reservesOpensAt`/`guestsOpensAt` que ainda está no futuro; se não sobrar nenhuma, `all_open` quando os convidados estiverem ligados, ou nada quando estiverem desligados. Enquanto os próprios membros ainda não puderem entrar, a contagem regressiva que já existe cobre esse caso e a linha não aparece. | para o membro, o que importa é "quando a lista abre para os outros". O card completo com os 3 estados fica no Ajustes                                                                              |
| D6  | **Aba Ajustes** reúne `LayersCard` (resumo + editor, como hoje), `GroupLinksCard` (como hoje) e uma seção "Jogo da semana" com o botão "Cancelar jogo" (mesma regra `canCancel` e mesmo diálogo). O botão sai do `GameCard`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | a ação destrutiva sai do meio da página do jogo                                                                                                                                                    |
| D7  | **Botão "Convidar"** na aba Membros, só para o dono: abre um `BottomSheet` com os links de membro e de reserva, **só para copiar**. Gerar outro link continua só no Ajustes. O `GroupLinksCard` ganha a prop `manage` (padrão `true`): com `false`, esconde o "Gerar outro link" e o link do jogo.                                                                                                                                                                                                                                                                                                                                                                                             | convidar é o que o dono faz olhando a lista de membros; gerenciar (invalidar link) fica num lugar só                                                                                               |
| D8  | **Cabeçalho enxuto**: nome, esporte · dia e horário · local. O fuso só aparece quando for diferente do fuso efetivo do usuário (`showGroupTimeZone(groupTz, userTz)`, função pura). O selo "Você é o dono" sai: a aba Ajustes já mostra isso.                                                                                                                                                                                                                                                                                                                                                                                                                                                  | menos ruído; o fuso só importa quando muda o horário que a pessoa lê                                                                                                                               |
| D9  | **Nomes**: `groups.roster` passa de "Elenco" para "Membros do grupo" (en: "Group members"), e a aba usa `groups.tabs.members` "Membros". Escalação e Banco continuam iguais. Chaves novas em `pt-BR` e `en`: `groups.tabs.{game,members,settings}`, `groups.invite` "Convidar", `groups.inviteHint`, `groups.nextLayer.{reserves,guests}` "{Reservas/Convidados} entram a partir de {date}", `groups.nextLayer.allOpen` "Lista aberta para todos", `groups.gameSection` "Jogo da semana". `groups.youAreOwner` sai das duas línguas se não sobrar uso.                                                                                                                                         | o pedido do dono: separar as duas listas de pessoas pelos nomes                                                                                                                                    |
| D10 | Funções puras novas ficam em `src/modules/groups/tabs.ts` (`groupTabs`, `tabRedirect`, `showGroupTimeZone`) e `nextLayer` em `layers.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | o padrão do repo é testar a regra sem montar componente                                                                                                                                            |

## Contrato

**Sem mudança.** Nenhuma rota de api, schema, erro ou notificação nova. O passo 2 só confere o typecheck.

## Interface (para os testes)

```ts
// src/modules/groups/tabs.ts
export type GroupTab = 'group' | 'group-members' | 'group-settings'; // nomes das rotas
export function groupTabs(isOwner: boolean): GroupTab[];
export function tabRedirect(routeName: string, isOwner: boolean): GroupTab | undefined; // undefined = fica
export function showGroupTimeZone(groupTimeZone: string, userTimeZone: string): boolean;

// src/modules/groups/layers.ts
export type NextLayer = { kind: 'reserves' | 'guests'; at: string } | { kind: 'all_open' } | undefined;
export function nextLayer(
  game: Pick<Game, 'status' | 'opensAt' | 'reservesOpensAt' | 'guestsOpensAt'>,
  now: Date,
): NextLayer;
```

## Casos de comportamento

1. **Abas do membro.** `groupTabs(false)` → `['group', 'group-members']`.
2. **Abas do dono.** `groupTabs(true)` → `['group', 'group-members', 'group-settings']`.
3. **Ajustes sem ser dono.** `tabRedirect('group-settings', false)` → `'group'`. `tabRedirect('group-settings', true)` → `undefined`. `tabRedirect('group-members', false)` → `undefined`. `tabRedirect('group', false)` → `undefined`.
4. **Fuso no cabeçalho.** `showGroupTimeZone('America/Sao_Paulo', 'America/Sao_Paulo')` → `false`; `('America/Sao_Paulo', 'Europe/Lisbon')` → `true`.
5. **Próxima camada: reservas.** Jogo `open`, membros abertos há 1h, reservas daqui a 2h, convidados daqui a 5h → `{ kind: 'reserves', at: <reservesOpensAt> }`.
6. **Próxima camada: convidados.** Reservas já abertas, convidados daqui a 3h → `{ kind: 'guests', at: <guestsOpensAt> }`.
7. **Todas abertas.** Membros, reservas e convidados já abertos → `{ kind: 'all_open' }`.
8. **Convidados desligados.** Sem `guestsOpensAt` e reservas já abertas → `undefined`. Sem `guestsOpensAt` e reservas no futuro → `{ kind: 'reserves', … }`.
9. **Membros ainda fechados.** `opensAt` no futuro (status `scheduled`) → `undefined` (a contagem regressiva cobre esse caso).
10. **Jogo cancelado ou em andamento.** Status `cancelled` ou `in_progress`, com reservas no futuro → `undefined`.
11. **Instante exato.** `reservesOpensAt` igual a `now` conta como aberto (igual ao `LayersCard`: `<= now` é aberto).
12. **Rotas.** As rotas `group`, `group-members` e `group-settings` existem como filhas de `groups/:id`, e `{ name: 'group', params: { id } }` resolve para `/groups/:id` (teste com `createRouter` e `createMemoryHistory` sobre `groupsRoutes`).
13. **i18n.** Toda chave nova existe em `pt-BR` e `en` (o `locales.test.ts` existente cobre).

Roteiro manual (o dono, no DevTools a 390px):

- Como membro: abrir o grupo → aba Jogo com placar, confirmar/desistir, linha "Reservas entram a partir de…", Escalação e Banco, **sem** "Cancelar jogo". Aba Membros sem os botões de remover e de convidar. Sem a aba Ajustes. Colar `/groups/:id/settings` cai no Jogo.
- Como dono: aba Ajustes com a abertura (editar e salvar), os 3 links (copiar e gerar outro) e cancelar o jogo com o diálogo. Na aba Membros, "Convidar" abre o painel com os links de membro e de reserva, só para copiar. Remover um membro continua pedindo confirmação.
- Trocar de aba e usar o voltar do navegador: volta para a aba anterior, sem recarregar.
- Grupo com fuso diferente do perfil: o fuso aparece no cabeçalho. Com o mesmo fuso, não aparece.
- Notificação de "subiu da fila" e Home → "Ver jogo da semana": caem na aba Jogo.
- Rolar a aba Jogo: as abas ficam presas no topo.

## Tarefas

| #   | Tarefa                                                                                                                                           | Pronto quando                                         | Risco                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | ----------------------------------------------------------- |
| 1   | `tabs.ts` e `nextLayer` em `layers.ts` (casos 1–11)                                                                                              | testes verdes                                         | baixo                                                       |
| 2   | Rotas filhas em `routes.ts` (D1, caso 12); páginas `GroupGamePage`, `GroupMembersPage` e `GroupSettingsPage` em `pages/`                         | `/groups/:id/members` e `/settings` abrem a aba certa | baixo                                                       |
| 3   | `GroupPage` vira casco: carregamento, cabeçalho enxuto (D8), `q-tabs` fixas (D3), `router-view` com props/eventos (D2), redirect do Ajustes (D4) | roteiro de trocar de aba; o voltar funciona           | médio: `router-view` com slot e o `key` para não recarregar |
| 4   | Aba Jogo: `GameCard` sem o "Cancelar jogo" + linha de camada (D5)                                                                                | roteiro do membro                                     | baixo                                                       |
| 5   | Aba Membros: lista atual + "Convidar" com `BottomSheet` (D7); `GroupLinksCard` com `manage`                                                      | roteiro do dono na aba Membros                        | baixo                                                       |
| 6   | Aba Ajustes: `LayersCard`, `GroupLinksCard`, seção com "Cancelar jogo" (D6)                                                                      | roteiro do dono no Ajustes                            | baixo                                                       |
| 7   | i18n `pt-BR`/`en` (D9), remover chaves sem uso, `npm run check`                                                                                  | check verde                                           | baixo                                                       |

## Perguntas

1. **Linha de abertura também para o dono (D5)?** Recomendo que sim: é a mesma informação, mais curta, e o dono já tem o card completo no Ajustes. ✅ sim (dono, 2026-11-09).
2. **"Convidar" só copia (D7)?** ✅ sim (dono, 2026-11-09).
3. **"Elenco" → "Membros do grupo" (D9)?** ✅ sim (dono, 2026-11-09).
4. **Selo "Você é o dono" (D8):** ✅ sai de vez (dono, 2026-11-09).

## Status

| Passo            | Estado                                                                                                                                                     |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Plano         | ✅ aprovado (2026-11-09): linha de camada para todos, Convidar só copia, "Membros do grupo", selo de dono sai                                              |
| 2. Contrato      | ✅ sem mudança; `npm run typecheck` verde                                                                                                                  |
| 3. Testes        | ✅ `test-writer`: casos 1–4 (`tabs.test.ts`), 5–11 (`layers.test.ts`), 12 (`routes.test.ts`), 13 (`locales.test.ts`); falhavam por falta de implementação  |
| 4. Implementação | ✅ tarefas 1–7; web 151, api 235, rules 56 verdes; `vite build` ok. `npm run lint` só falha no `011-modelador-de-dados.md` (fora desta tarefa, não staged) |
| 5. Revisão       | ✅ `reviewer`: aprovado com ressalvas, sem ❌ (`012-abas-do-grupo.review.md`)                                                                              |
| 6. Entrega       | ✅ tudo staged; commit com o dono                                                                                                                          |
