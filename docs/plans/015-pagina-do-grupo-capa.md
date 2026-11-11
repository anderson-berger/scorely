# 015 — Página do grupo com capa, um bloco de estado e desktop em duas colunas

Pedido do dono (2026-11-09): ajustar a página do grupo e as abas (plano 012). Pelo print, a aba Jogo repete o mesmo fato em cinco lugares, perde o placar com a lista fechada, mostra a escalação vazia e não tem a identidade do grupo que a tela de Grupos (plano 014) ganhou. O dono aprovou as telas do canvas (https://claude.ai/artifact/2BsZknN4PDjjyHzx6p5Zjo, linhas "Página do grupo") e pediu para implementar. Entram as propostas A–E e o caminho "Grupos / nome" no desktop.

## Objetivo

- **A. Capa do grupo** no topo da página: a mesma capa provisória, o mesmo logo com iniciais e a mesma cor do `GroupCard`. Ao lado do logo ficam o nome, "esporte · dia hora" e o selo do estado do jogo. As abas ficam embaixo, presas no topo ao rolar, com "Membros · N".
- **B. Aba Jogo com um bloco só**: a data do jogo como título, o placar "confirmados:vagas" sempre visível e uma área de ação que muda com o estado. Escalação e Banco só aparecem com gente na lista.
- **C. Desktop**: a página do grupo vai até 960px. Na aba Jogo, a partir de 1024px e com gente na lista, ficam duas colunas: o bloco à esquerda e a escalação à direita, em duas colunas.
- **D. Membros agrupados**: "Membros · N" (com o dono no topo) e "Reservas · N", sem o papel em cada linha.
- **E. Ajustes em seções**: Abertura da lista, Links de convite (em linhas compactas), Dados do grupo (reservado) e Zona de perigo.

Nada muda na api nem no contrato.

## Fora de escopo

- Upload de logo e capa e a edição dos dados do grupo (tarefa separada; aqui só fica o lugar reservado).
- Notificação de "a lista abriu": a api não tem esse tipo. O texto não promete aviso.
- Mudanças nas regras de fila, de camadas ou nas permissões.

## Decisões

| #   | Decisão                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Por quê                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| D1  | **`GroupHero`** em `modules/groups/components/`: capa de 112px (150px a partir de 1024px) com listras e a borda de 4px na cor `groupColor(group.id)`; logo de 68px (88px no desktop) com as iniciais; nome; "esporte · dia hora"; `StatusChip` do jogo (sobre a capa no celular, à direita do nome no desktop). O `GroupPage` usa o hero no lugar do cabeçalho de hoje.                                                                                                                                                                                                                                                                                                                                                                                                                     | a mesma identidade da tela de Grupos, num lugar só            |
| D2  | **Abas** dentro do hero: "Jogo", "Membros · N" e "Ajustes" (dono), continuam presas abaixo do cabeçalho (plano 012, D3).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | a contagem diz quanta gente há sem abrir a aba                |
| D3  | **Caminho no desktop**: a partir de 1024px, "Grupos / {nome}" acima do hero, com "Grupos" como link para `groups`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | sem botão de voltar, é o atalho de volta no desktop           |
| D4  | **Largura**: a página do grupo usa `.sc-page--group` (`max-width: 960px`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | as duas colunas cabem; as outras telas não mudam              |
| D5  | **Título do jogo**: "{dia da semana}, {data} · {hora}" (ex.: "Sexta, 13/11 · 19:00"), pelo `formatDateTime` com um estilo novo `weekday` (`{ weekday: 'long' }`), com a primeira letra maiúscula. O `groups.game` ("Jogo de {date}") sai.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | a data aparece uma vez, por extenso                           |
| D6  | **Placar sempre visível**: número grande "confirmados:vagas" com a legenda `groups.scoreLegend` (plano 014). Com fila, a legenda ganha " · {n} na fila". O `ScoreBoard` de três células sai do `GameCard` (continua no código se mais alguém usar; se ninguém usar, sai).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | com a lista fechada, a pessoa continua vendo quantas vagas há |
| D7  | **Área de ação**, uma por estado, abaixo do placar:<br>• cancelado: a faixa vermelha de hoje, no lugar do bloco inteiro;<br>• lista fechada para mim (`opens_at`): "A lista abre em" + `formatCountdown` (ex.: "1d 22h 45min") + "Confirme a partir de {data}";<br>• estou na lista ou na fila: "Você joga · {n}º da lista" ou "Na fila · {n}º" e, se ainda posso mudar, "Desistir";<br>• posso confirmar: botão grande "Confirmar presença" (ou "Entrar na fila") e uma linha embaixo com as vagas que sobram e a próxima camada ("Sobram 3 vagas · Reservas entram a partir de qui 19:00");<br>• em andamento: "O jogo já começou".<br>Saem o botão desativado, o `groups.notifyWhenOpens` e o `groups.youCanConfirmAt` repetidos.                                                        | um fato, um lugar                                             |
| D8  | **`formatCountdown(c)`** em `scoreboard.ts`: "1d 22h 45min"; sem dias, "22h 45min"; sem horas, "45min"; tudo zero, "0min". As unidades (d, h, min) são as mesmas em pt-BR e en.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | a contagem cabe numa linha                                    |
| D9  | **Escalação e Banco** só aparecem com alguém na lista (Escalação com `confirmed.length > 0`, Banco com `waitlist.length > 0`). Títulos com contagem: "Escalação · 9", "Banco · 2".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | sem card vazio                                                |
| D10 | **Duas colunas**: a partir de 1024px, e só quando a Escalação aparece, o `GameCard` vira uma grade `5fr 7fr`: à esquerda, o título e o bloco; à direita, Escalação e Banco, com as pessoas em duas colunas. Sem ninguém na lista, fica uma coluna centralizada de até 480px.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | no desktop, o bloco e a lista ficam lado a lado sem rolar     |
| D11 | **Membros agrupados**: `memberSections(members)` em `groups.ts` devolve `{ members, reserves }`, com o dono primeiro em `members` e o resto na ordem da api. A aba mostra "Membros · N" (com o "+ Convidar" do dono no título) e "Reservas · N" (borda tracejada; some se não houver reservas). Cada linha tem só o avatar, o nome e, para o dono, o rótulo "Dono"; o botão de remover continua para o dono. A partir de 1024px, as linhas ficam em duas colunas.                                                                                                                                                                                                                                                                                                                           | o papel vira seção, não repetição                             |
| D12 | **Ajustes em seções**, nesta ordem: "Abertura da lista" (o `LayersCard` como está), "Links de convite" (o `GroupLinksCard` em linhas compactas: nome do link, a dica, o botão de gerar outro com ícone e `aria-label`, e "Copiar"; sem a url visível; link que não existe mostra "Gerar link"), "Dados do grupo" (caixa tracejada: "Nome, horário, vagas, logo e capa: em breve") e "Zona de perigo" (texto "Cancela o jogo de {data} e avisa quem confirmou." e o botão "Cancelar jogo"; a seção só aparece com `canCancel`). O painel "Convidar" da aba Membros usa as mesmas linhas, sem o botão de gerar outro (plano 012, D7).                                                                                                                                                         | hierarquia clara; a ação destrutiva separada                  |
| D13 | **Textos novos e alterados** em `pt-BR` e `en`: `groups.lineupCount` "Escalação · {count}", `groups.benchCount` "Banco · {count}", `groups.waitingSuffix` " · {count} na fila", `groups.confirmFrom` "Confirme a partir de {date}", `groups.youPlayAt` "Você joga · {position}º da lista", `groups.youWaitAt` "Na fila · {position}º", `groups.spotsLeft` "Sobra {count} vaga \| Sobram {count} vagas", `groups.reservesSection` "Reservas · {count}", `groups.membersSection` "Membros · {count}", `groups.settings.{layers,links,data,dataHint,danger,dangerHint}`, `groups.breadcrumb` "Grupos". Saem as chaves que ficarem sem uso (`groups.game`, `groups.notifyWhenOpens`, `groups.youCanConfirmAt`, `groups.countdown.*`, `groups.roster`, `groups.score.*` se o `ScoreBoard` sair). | regra de i18n, sem chave morta                                |

Notas da implementação (apontadas pelo reviewer):

- **D1/D2:** as abas ficam fora do `GroupHero`, logo abaixo dele no `GroupPage`. No desktop o hero tem `overflow: hidden` (cantos arredondados), e isso impediria as abas de ficarem presas no topo.
- **D2:** a aba "Membros · N" conta todos os participantes (membros e reservas). A seção "Membros · N" dentro da aba conta só os membros.
- **D5:** o título fica "Sexta-feira, 13/11 · 19:00", com o dia da semana completo e um estilo novo `dayMonth` no `formatDateTime`.
- **D13:** `groups.lineup`, `bench`, `youPlay` e `yourPlace` ficaram sem uso, mas continuam porque os testes do plano 008 ainda as exigem.

Correção do dono (2026-11-09, depois da entrega): **sem caminho "Grupos / nome"**. A navegação fica só no menu lateral (plano 013); a página não tem botão de voltar nem caminho. **D3 sai**, e com ele a chave `groups.breadcrumb` (que passa a estar entre as que saem no caso 9).

## Ajuste do dono: espaço vazio no desktop (2026-11-09, depois da entrega)

Print a 1840px: menu expandido de 240px para um item só, coluna de 960px com cerca de 300px vazios de cada lado e, com a lista fechada e vazia, o bloco de 480px no meio e meia tela vazia embaixo. O dono aprovou as recomendações A–D:

| #   | Decisão                                                                                                                                                                                                                                                                                                                                                                                                                         | Por quê                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| D14 | **Escalação vira as vagas** (substitui D9 e D10): a seção "Escalação · {confirmados}/{vagas}" aparece **sempre** (menos com o jogo cancelado), com uma linha por vaga: as preenchidas com a pessoa e as livres como "vaga", com borda tracejada. Até 12 vagas livres aparecem uma a uma; acima disso, uma linha "+ {n} vagas livres". O Banco continua aparecendo só com fila. A função pura é `lineupSlots(confirmed, slots)`. | a coluna nunca fica vazia e mostra quanto falta para lotar            |
| D15 | **Abertura da lista para todos**: abaixo do bloco do placar, a seção "Abertura da lista" com as três camadas (Membros, Reservas, Convidados), o estado (Aberta, Em breve, Desligado) e quando abre. Não aparece com o jogo cancelado. A função pura `layerTimeline(game, now)` passa a ser usada também pelo resumo do `LayersCard`.                                                                                            | responde "quando o reserva ou o convidado entra?" sem abrir o Ajustes |
| D16 | **Duas colunas sempre no desktop** (≥ 1024px): à esquerda, o título, o bloco e a abertura da lista; à direita, a Escalação (vagas em duas colunas) e o Banco. Com o jogo cancelado, fica uma coluna só. No celular, tudo empilhado nessa mesma ordem.                                                                                                                                                                           | o espaço do desktop passa a ter conteúdo em qualquer estado           |
| D17 | **Página do grupo até 1200px** (substitui D4).                                                                                                                                                                                                                                                                                                                                                                                  | com duas colunas sempre, a largura é usada                            |
| D18 | **Menu no desktop**: o trilho de ícones (64px) é sempre o padrão; o ☰ expande o menu **por cima** do conteúdo (`mini-to-overlay` do Quasar) e ele recolhe ao escolher um item ou ao tocar no ☰ de novo. A preferência salva no navegador (plano 013, D10) **sai**, porque um menu que abre por cima não deve abrir sozinho ao carregar. Saem `readRailExpanded` e `storeRailExpanded` e os testes do caso 8 do plano 013.     | o menu não come 176px de tela fixos enquanto tem um ou dois itens     |
| D19 | **Abas maiores no desktop**: rótulos de 18px com 32px entre eles; no celular continuam distribuídas na largura toda.                                                                                                                                                                                                                                                                                                            | as abas acompanham a página larga                                     |

**Correção do dono no D18 (2026-11-10):** o menu expandido **não** fica por cima da tela: ele **empurra o conteúdo**, e no desktop não recolhe sozinho ao escolher um item. O menu também precisa de **rolagem própria**, separada da página: o `view` do `q-layout` passa de `hHh lpR fFf` para `hHh LpR fFf` (o `L` maiúsculo deixa o drawer fixo). A preferência salva continua fora: o menu começa recolhido.

**Correção do dono (2026-11-10), menu no celular:** com 240px fixos, num celular de 375px sobrava uma faixa de cerca de 135px com a página aparecendo. No `xs` (< 600px), o drawer passa a ter a largura da tela (`:width` ligado a `$q.screen.width`); de 600px em diante continua com 240px.

### Interface do ajuste

```ts
// src/modules/groups/scoreboard.ts
export type LineupSlot<T> = { position: number; person?: T };
export function lineupSlots<T>(confirmed: T[], slots: number): { rows: LineupSlot<T>[]; hiddenFree: number };

// src/modules/groups/layers.ts
export type LayerKey = 'members' | 'reserves' | 'guests';
export type LayerStep = { key: LayerKey; state: 'open' | 'soon' | 'off'; at?: string };
export function layerTimeline(
  game: Pick<Game, 'opensAt' | 'reservesOpensAt' | 'guestsOpensAt'>,
  now: Date,
): LayerStep[];
```

### Casos do ajuste

10. **Vagas vazias.** `lineupSlots([], 12)` → 12 linhas, posições 1–12, todas sem pessoa; `hiddenFree: 0`.
11. **Vagas preenchidas.** 3 pessoas e 12 vagas → as linhas 1–3 têm as pessoas na ordem; 4–12 sem pessoa.
12. **Muitas vagas livres.** 2 pessoas e 30 vagas → 14 linhas (2 preenchidas + 12 livres); `hiddenFree: 16`.
13. **Lista cheia.** 12 pessoas e 12 vagas → 12 linhas preenchidas; `hiddenFree: 0`. Mais pessoas que vagas (dado antigo) → uma linha por pessoa, sem livres.
14. **Linha do tempo.** Membros abertos, reservas no futuro e convidados desligados → `[{ members, open, at }, { reserves, soon, at }, { guests, off }]`, nessa ordem.
15. **Instante exato.** Camada que abre exatamente em `now` → `open`.
16. **Menu.** `readRailExpanded` e `storeRailExpanded` não existem mais em `src/layouts/nav.ts` (o caso 8 do plano 013 sai).
17. **i18n.** `groups.freeSlot` ("vaga") e `groups.moreFreeSlots` ("+ {count} vaga livre | + {count} vagas livres", com `{count}`) existem em pt-BR e en.

## Contrato

**Sem mudança.**

## Interface (para os testes)

```ts
// src/modules/groups/scoreboard.ts
export function formatCountdown(c: Countdown): string;

// src/modules/groups/groups.ts
export function memberSections<T extends Pick<Member, 'isOwner' | 'role'>>(
  members: T[],
): { members: T[]; reserves: T[] };

// src/lib/datetime.ts
export type DateTimeStyle = 'dateTime' | 'date' | 'time' | 'weekday';
```

## Casos de comportamento

1. **Contagem com dias.** `formatCountdown({ days: 1, hours: 22, minutes: 45 })` → `"1d 22h 45min"`.
2. **Sem dias.** `{ 0, 22, 45 }` → `"22h 45min"`; `{ 0, 0, 45 }` → `"45min"`; `{ 0, 0, 0 }` → `"0min"`.
3. **Dias sem horas.** `{ 2, 0, 5 }` → `"2d 0h 5min"` (com dias, as horas sempre aparecem).
4. **Seções de membros.** Dados dono, membro A, reserva R, membro B (nessa ordem) → `members: [dono, A, B]`, `reserves: [R]`.
5. **Dono no meio.** Dados A, dono, B → `members: [dono, A, B]`.
6. **Sem reservas.** → `reserves: []`.
7. **Não altera a entrada.** O array recebido continua igual.
8. **Estilo `weekday`.** `formatDateTime('2026-11-13T22:00:00.000Z', 'weekday', { timeZone: 'America/Sao_Paulo', locale: 'pt-BR' })` → `"sexta-feira"`; em `en`, `"Friday"`.
9. **i18n.** As chaves novas existem em `pt-BR` e `en`; as que saíram não existem; `groups.lineupCount`, `benchCount`, `waitingSuffix`, `spotsLeft`, `reservesSection` e `membersSection` usam `{count}`; `confirmFrom` usa `{date}`; `youPlayAt` e `youWaitAt` usam `{position}`.

Roteiro manual (390px e 1840px), comparando com o canvas:

- O topo tem capa, logo e cor iguais aos do card na tela de Grupos, e as abas mostram "Membros · N".
- Lista fechada: placar 0:12, "A lista abre em 1d 22h 45min" e "Confirme a partir de …", sem botão desativado; a abertura da lista abaixo do placar e a "Escalação · 0/12" com as vagas livres numeradas (D14, D15).
- Lista aberta: "Confirmar presença" e a linha das vagas e da próxima camada; depois de confirmar, "Você joga · 3º da lista" e "Desistir"; a Escalação aparece com a minha linha em destaque.
- Desktop: sem caminho nem botão de voltar, página de até 1200px, sempre em duas colunas (menos com o jogo cancelado), abas com rótulos de 18px; o ☰ expande o menu por cima do conteúdo e ele recolhe ao escolher um item (D16–D19).
- Membros: "Membros · N" com o dono no topo e "Reservas · N"; no desktop, em duas colunas.
- Ajustes: as quatro seções; "Copiar" e gerar outro link funcionam; "Cancelar jogo" pede confirmação.
- Link do jogo como convidado (`/play/...`): o `GameCard` novo continua funcionando.

## Tarefas

| #   | Tarefa                                                                                | Pronto quando      | Risco                             |
| --- | ------------------------------------------------------------------------------------- | ------------------ | --------------------------------- |
| 1   | `formatCountdown`, `memberSections`, estilo `weekday` (casos 1–8)                     | testes verdes      | baixo                             |
| 2   | `GroupHero` e o `GroupPage` com hero, caminho e largura (D1–D4)                       | roteiro do topo    | médio: abas presas dentro do hero |
| 3   | `GameCard`: título, placar, área de ação, listas condicionais e duas colunas (D5–D10) | roteiro do jogo    | médio: muitos estados             |
| 4   | `GroupMembersPage` agrupada (D11)                                                     | roteiro de Membros | baixo                             |
| 5   | `GroupSettingsPage` em seções e `GroupLinksCard` compacto (D12)                       | roteiro de Ajustes | baixo                             |
| 6   | i18n (D13), limpeza do que ficou sem uso e `npm run check`                            | check verde        | baixo                             |

## Perguntas

Nenhuma bloqueando: o dono aprovou as telas do canvas e pediu para implementar (2026-11-09).

## Status

| Passo            | Estado                                                                                                                                                                                                                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Plano         | ✅ aprovado pelo canvas (2026-11-09): A–E e o caminho no desktop                                                                                                                                                                                                                             |
| 2. Contrato      | ✅ sem mudança; `npm run typecheck` verde                                                                                                                                                                                                                                                    |
| 3. Testes        | ✅ `test-writer`: casos 1–3 (`scoreboard.test.ts`), 4–7 (`groups.test.ts`), 8 (`datetime.test.ts`), 9 (`locales.test.ts`; tirou `groups.roster`, `groups.score.*` e `groups.countdown.*` das listas dos planos 008 e 012). 1–8 passaram de primeira porque as funções foram escritas junto   |
| 4. Implementação | ✅ tarefas 1–6; web 256, api 253, base 12, rules 56 verdes; lint verde; `vite build` ok. `ScoreBoard.vue` removido (sem uso). Ficaram `groups.lineup`, `bench`, `youPlay` e `yourPlace` sem uso, porque os testes do 008 ainda as exigem                                                     |
| 5. Revisão       | ✅ `reviewer`: aprovado com ressalvas, sem ❌ (`015-pagina-do-grupo-capa.review.md`); título corrigido depois                                                                                                                                                                                |
| 6. Entrega       | ✅ ajuste D14–D19: casos 10–17 pelo `test-writer`; `reviewer` aprovou com ressalvas, e o ❌ (tamanho do rótulo das abas) e as ressalvas foram corrigidos (2ª seção do `015-pagina-do-grupo-capa.review.md`); web 262, api 253, base 12, rules 56, lint verde; tudo staged, commit com o dono |
