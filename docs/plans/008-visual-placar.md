# 008 — Visual "Placar" em todas as telas do scorely web

Pedido do dono (2026-11-07): aplicar a direção visual **C · Placar** (escuro, números grandes, verde-limão) em todas as telas. Referência: o protótipo https://claude.ai/artifact/V5QXG3avtSSnUNddaNfHLD, nas linhas "C · Placar" e "C · Escolhida — demais telas". As direções A e B foram descartadas.

## Objetivo

Trocar o visual padrão do Quasar por um tema próprio, mobile-first, igual ao protótipo. A troca é feita por tokens e por poucos componentes de base, para as telas não repetirem estilo. O comportamento não muda: as mesmas rotas e chamadas à api e as mesmas regras de camadas, fila e permissões do dono.

| Token              | Valor                                                                | Uso                                                 |
| ------------------ | -------------------------------------------------------------------- | --------------------------------------------------- |
| `--sc-bg`          | `#0D1015`                                                            | fundo da página                                     |
| `--sc-surface`     | `#161A21`                                                            | cards, inputs, sheets                               |
| `--sc-line`        | `#262B34`                                                            | bordas e divisórias                                 |
| `--sc-line-strong` | `#3A404C`                                                            | borda de input, botão secundário, tracejado         |
| `--sc-text`        | `#F2F4F7`                                                            | texto principal                                     |
| `--sc-text-2`      | `#C4CAD4`                                                            | texto secundário                                    |
| `--sc-muted`       | `#9AA3B2`                                                            | legendas (contraste ≥ 4.5:1 sobre `--sc-surface`)   |
| `--sc-dim`         | `#6B7385`                                                            | só decoração e números grandes (não texto pequeno)  |
| `--sc-accent`      | `#C6F432`                                                            | destaque, botão principal (texto `--sc-bg` em cima) |
| `--sc-danger`      | `#FF8A80`                                                            | cancelar, remover, "Cancelado"                      |
| fonte display      | Barlow Condensed 600/700/800, caixa alta                             | títulos, números, botões principais                 |
| fonte corpo        | Inter 400/500/600                                                    | todo o resto                                        |
| raio               | 10 (chip/stepper) · 12 (input) · 14 (botão) · 16 (card) · 22 (sheet) |                                                     |

## Fora de escopo

- **Tela de convite antes do login com dados do jogo** (protótipo "Link do jogo"): hoje `GET /play/{token}` exige login (plano 007). Sem login, o convidado cai no login comum, que guarda o redirect. A página do jogo ganha o visual novo depois do login. Mostrar grupo e horário antes do login pede uma rota pública, que fica para depois.
- "Ana te chamou para jogar" e "Próximo jogo" no jogo cancelado: a api não manda quem convidou nem o jogo seguinte.
- Tema claro e troca de tema.
- Times, placar de partidas e MVP (E3–E5).
- Página de notificações (continua só o sino, agora com outro visual).

## Decisões

| #   | Decisão                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Por quê                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Só tema escuro.** Quasar com `config: { dark: true }`, cores da marca em `src/css/quasar.variables.sass` (`$primary: #C6F432`, `$negative: #FF8A80`, `$dark-page: #0D1015`, `$dark: #161A21`, ...) e os tokens `--sc-*` em `src/css/app.scss`                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | a direção escolhida é escura; um tema só corta o trabalho pela metade                                                                                |
| D2  | **Fontes empacotadas** com `@fontsource/inter` e `@fontsource/barlow-condensed`, importadas no `main.ts` (só os pesos usados)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | sem pedido a domínio externo e com versão fixa no `package.json`. Alternativa: `<link>` do Google Fonts no `index.html` (pergunta 2)                 |
| D3  | **Cores só por token.** Nenhum hex em `.vue` fora de `src/css/`; usar `var(--sc-*)` ou a cor do Quasar (`color="primary"`). Novo check em `checks/web.test.ts` (caso 13)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | o visual não se perde tela a tela; trocar o destaque vira uma linha (pergunta 3)                                                                     |
| D4  | Classes utilitárias globais em `app.scss`: `.sc-display` (Barlow, caixa alta, `letter-spacing` 0.5–1px), `.sc-number` (Barlow 800, `tabular-nums`), `.sc-label` (12px, caixa alta, `--sc-text-2`), `.sc-card` (superfície + borda + raio 16)                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | as telas montam o visual com classes, sem CSS repetido                                                                                               |
| D5  | **4 componentes de base** em `src/components/`: `ScoreBoard` (células número + legenda, ex. Dentro/Vagas/Na fila), `StatusChip` (estado do jogo → texto e tom), `HoursStepper` (− valor +, alvo ≥ 44px, `aria-label`) e `BottomSheet` (`q-dialog position="bottom"` com alça e título)                                                                                                                                                                                                                                                                                                                                                                                                                              | são os blocos que se repetem no protótipo                                                                                                            |
| D6  | **Stepper de horas por escada fixa**: 0, 1, 2, 3, 4, 6, 8, 12, 18, 24, 36, 48, 72, 96, 120, 144. O − e o + vão para o degrau vizinho; valor fora da escada (de grupo antigo) vai para o degrau mais próximo naquela direção. Depois de cada passo, as camadas são ajustadas para manter membros ≥ reservas ≥ convidados, dentro do `GROUP_LIMITS`                                                                                                                                                                                                                                                                                                                                                                   | 144 cliques de 1h não servem; os degraus cobrem os casos reais. Ajustar as outras camadas evita o erro `GROUP_LAYERS_INVALID` em vez de só mostrá-lo |
| D7  | O stepper de vagas vai de 1 em 1, dentro de `GROUP_LIMITS.slots`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 2–50 é curto                                                                                                                                         |
| D8  | "Abre qua 19:30" no criar grupo e no editor de camadas é calculado de `weekday`, `time` e horas, em hora local do grupo, sem data. No jogo existente continua vindo de `opensAt`/`reservesOpensAt`/`guestsOpensAt` por `formatDateTime`                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | ainda não existe jogo ao criar o grupo; sem converter fuso (ADR 0006: recorrência em hora local)                                                     |
| D9  | Contagem regressiva ("a lista abre em 01 dia 04 h 27 min") quando `listGate` dá `opens_at`. Atualiza a cada 30s com um `setInterval` limpo no `beforeUnmount`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | é o estado "Lista ainda fechada" do protótipo                                                                                                        |
| D10 | Notificações: em tela `xs` (`$q.screen.xs`) abrem num `BottomSheet`; em telas maiores, continua o `q-menu` com o visual novo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | no celular o menu de 360px fica apertado                                                                                                             |
| D11 | As confirmações (cancelar jogo, gerar outro link, remover) continuam com `$q.dialog`, agora com o tema escuro. A confirmação dentro da própria linha do protótipo não entra                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | o comportamento e os testes atuais ficam iguais; o visual já vem do tema                                                                             |
| D12 | Textos novos e renomeados, em `pt-BR` e `en` com as mesmas chaves: `groups.lineup` "Escalação", `groups.bench` "Banco (fila)", `groups.roster` "Elenco", `groups.youPlay` "Você joga", `groups.yourPlace` "{position}º da lista", `groups.score.in/slots/waiting` "Dentro/Vagas/Na fila", `groups.opensIn` "A lista abre em", `groups.countdown.days/hours/minutes`, `groups.youAreOwner` "Você é o dono", `groups.joinWaitlist` "Entrar na fila", `groups.wouldBeWaiting` "Lista cheia: você seria o {position}º da fila", `groups.layerOpensAt` "abre {weekday} {time}", `home.empty`/`home.emptyHint`/`home.gotLink`, `login.noPassword`, `groups.linksHint`, `groups.layerState.open/soon/off`, `weekdaysShort` | o tom do placar pedido pelo dono; regra de i18n do `web.md`                                                                                          |
| D13 | Layout mobile-first: conteúdo com `max-width: 480px` centralizado, margem lateral de 16px. No desktop vira uma coluna no meio                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | o protótipo é de celular; desktop sem layout próprio por enquanto                                                                                    |
| D14 | Cabeçalho: "SCORE**LY**" (com "ly" em destaque) à esquerda, sino e avatar à direita, sem a barra azul do Quasar. Nas páginas internas, botão voltar quadrado (44px) e o `StatusChip` no meio                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | igual ao protótipo                                                                                                                                   |

## Contrato

**Sem mudança.** Nenhuma rota, schema, erro ou tipo de notificação novo. O passo 2 do fluxo só confere o typecheck.

## Interface (para os testes)

Funções puras novas, testáveis sem montar componente:

```ts
// src/modules/groups/scoreboard.ts
export type Score = { confirmed: number; slots: number; waiting: number; full: boolean };
export function score(game: Pick<Game, 'confirmed' | 'waitlist' | 'slots'>): Score;

export type StatusTone = 'accent' | 'neutral' | 'danger';
export function statusTone(status: GameStatus): StatusTone; // open/in_progress → accent, scheduled → neutral, cancelled → danger

export type Countdown = { days: number; hours: number; minutes: number };
export function countdown(now: Date, at: string): Countdown;

export function initials(name: string): string; // "Ana Souza" → "AS"; "Rafa" → "R"; "" → "?"

// src/modules/groups/layers.ts
export const HOURS_LADDER: readonly number[];
export function stepHours(value: number, dir: 1 | -1, min: number, max: number): number;
export type Layers = { members: number; reserves: number; guests: number | null }; // null = convidados desligados
export function changeLayer(layers: Layers, key: keyof Layers, value: number | null): Layers;
export function layerOpensAt(weekday: number, time: string, hoursBefore: number): { weekday: number; time: string };
export function stepSlots(value: number, dir: 1 | -1): number;
```

## Casos de comportamento

1. **Placar.** Dado um jogo com 12 vagas, 12 confirmados e 2 na fila, quando chamo `score`, então recebo `{ confirmed: 12, slots: 12, waiting: 2, full: true }`. Com 9 confirmados e fila vazia: `{ 9, 12, 0, full: false }`.
2. **Tom do estado.** `open` → `accent`, `in_progress` → `accent`, `scheduled` → `neutral`, `cancelled` → `danger`.
3. **Contagem regressiva.** De agora até daqui a 1 dia, 4 h e 27 min e 40 s → `{ days: 1, hours: 4, minutes: 27 }` (segundos descartados). Horário já passado → `{ 0, 0, 0 }`, nunca negativo.
4. **Iniciais.** "Ana Souza" → "AS"; "Rafa Oliveira Lima" → "RL" (primeiro e último nome); "Rafa" → "R"; " " → "?"; "íris campos" → "ÍC".
5. **Escada, subindo.** `stepHours(24, +1, 0, 144)` → 36; `stepHours(4, +1, …)` → 6; `stepHours(144, +1, …)` → 144 (para no máximo).
6. **Escada, descendo.** `stepHours(36, -1, 0, 144)` → 24; `stepHours(1, -1, 1, 144)` → 1 (para no mínimo, que é 1 para os membros); `stepHours(0, -1, 0, 144)` → 0.
7. **Fora da escada.** `stepHours(30, +1, …)` → 36; `stepHours(30, -1, …)` → 24; `stepHours(5, -1, …)` → 4.
8. **Membros puxam as outras camadas para baixo.** `{ members: 48, reserves: 48, guests: 24 }`, membros → 24, então `{ 24, 24, 24 }`; membros → 12, então `{ 12, 12, 12 }`.
9. **Reservas e convidados empurram para cima.** `{ 24, 12, 6 }`, reservas → 36, então `{ 36, 36, 6 }`. Convidados → 48 em `{ 24, 12, 6 }`, então `{ 48, 48, 48 }`. Valores acima de 144 ficam em 144.
10. **Convidados desligados.** `changeLayer(l, 'guests', null)` → `guests: null`. Mexer em membros ou reservas com `guests: null` mantém `null`. Religar (`guests: 6`) com reservas em 4 dá `guests: 4`.
11. **"Abre" em hora local.** Jogo sexta (5) 19:30: 48h → `{ weekday: 3, time: '19:30' }`; 6h → `{ 5, '13:30' }`; 0h → `{ 5, '19:30' }`; 144h → `{ 6, '19:30' }` (sábado da semana anterior). Jogo domingo (0) 08:00, 12h → `{ 6, '20:00' }`.
12. **Vagas.** `stepSlots(12, +1)` → 13; `stepSlots(2, -1)` → 2; `stepSlots(50, +1)` → 50.
13. **Check de cores (D3).** Um `.vue` em `apps/scorely/web/src` com `#C6F432` ou `rgb(` no template ou no `<style>` faz o check falhar apontando o arquivo. `src/css/*` pode ter hex. O check passa no código entregue.
14. **i18n.** Toda chave nova existe em `pt-BR` e `en` (o tipo `MessageSchema` já barra no typecheck; o check só confere).

Roteiro manual (o dono, no celular ou no DevTools a 390px):

- Login: email → código → perfil no primeiro acesso → Meus grupos.
- Meus grupos: sem grupos (estado vazio "0:0") e com grupos (placar `12:12` e chip de estado).
- Criar grupo: chips de esporte e dia, vagas pelo stepper, camadas pela escada com "abre qua 19:30" mudando; desligar convidados.
- Jogo da semana como membro: confirmar, desistir, entrar na fila com a lista cheia; lista fechada com contagem regressiva; jogo cancelado.
- Como dono: os 3 links (copiar, gerar outro, gerar link do jogo), elenco e remoção, abertura da lista no painel de baixo, cancelar jogo.
- Link do jogo como convidado (outra conta): login → página do jogo.
- Sino: no celular abre o painel de baixo; no desktop, o menu.

## Tarefas

| #   | Tarefa                                                                                                                                                                           | Pronto quando                                                                          | Risco                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------- |
| 1   | Tema: `@fontsource/*`, `quasar.variables.sass` pelo `sassVariables` do `@quasar/vite-plugin`, `app.scss` com tokens e classes (D4), `dark: true`, `index.html` com `theme-color` | o app abre escuro, com as fontes, e os componentes do Quasar já usam as cores da marca | médio: ordem de import do sass do Quasar |
| 2   | `scoreboard.ts` e `layers.ts` (casos 1–12)                                                                                                                                       | testes verdes                                                                          | baixo                                    |
| 3   | `ScoreBoard`, `StatusChip`, `HoursStepper`, `BottomSheet`                                                                                                                        | usados em pelo menos uma tela; foco visível; alvos ≥ 44px                              | baixo                                    |
| 4   | `MainLayout` (D14) e `NotificationBell` (D10)                                                                                                                                    | cabeçalho como no protótipo; sheet no `xs` e menu no resto                             | médio: `q-menu` teleportado e estilo     |
| 5   | `LoginPage` e `ProfilePage` (gênero em botões)                                                                                                                                   | roteiro do login                                                                       | baixo                                    |
| 6   | `HomePage`: cards com placar e estado, estado vazio, botão criar                                                                                                                 | roteiro de Meus grupos                                                                 | baixo                                    |
| 7   | `GroupCreatePage`: chips, steppers (D6/D7), "abre ..." (D8)                                                                                                                      | roteiro de criar grupo; a validação do Zod continua igual                              | médio                                    |
| 8   | `GameCard`: placar, "Você joga"/entrar na fila, Escalação/Banco, estados fechada (D9), cancelado, em andamento                                                                   | roteiro do jogo                                                                        | médio: timer                             |
| 9   | `LayersCard`: 3 cards de camada + editor no `BottomSheet` com linha do tempo e steppers                                                                                          | roteiro de abertura                                                                    | médio                                    |
| 10  | `GroupPage` (cabeçalho, ações do dono, elenco), `GroupLinksCard`, `JoinPage`, `PlayPage`                                                                                         | roteiro do dono e do convidado                                                         | baixo                                    |
| 11  | i18n `pt-BR`/`en` (D12), check de cores (caso 13), limpeza dos `text-grey-7`/`q-pa` que sobrarem                                                                                 | `npm run check` verde                                                                  | baixo                                    |

## Perguntas (respondidas pelo dono em 2026-11-07: seguir as recomendações)

1. **Só escuro (D1)?** Recomendo que sim. Um tema claro pode vir depois, já que tudo passa por tokens.
2. **Fontes (D2):** empacotar com `@fontsource` (2 dependências novas, sem pedido externo) ou `<link>` do Google Fonts? Recomendo `@fontsource`.
3. **Check de cores (D3):** posso criar a regra "nenhum hex em `.vue`" no `checks/`? Recomendo que sim, para o visual não voltar a se espalhar.
4. **Fora de escopo:** concorda em deixar a tela de convite antes do login (precisa de rota pública) para outro plano?

## Status

| Passo            | Estado                                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Plano         | ✅ aprovado (2026-11-07): só escuro, `@fontsource`, check de cores, convite pré-login fora                                                                               |
| 2. Contrato      | ✅ sem mudança; `npm run typecheck` verde                                                                                                                                |
| 3. Testes        | ✅ `test-writer`: casos 1–12 (`scoreboard.test.ts`, `layers.test.ts`), 13 (`checks/web.test.ts`), 14 (`locales.test.ts`); 1–12 falhavam por falta dos módulos            |
| 4. Implementação | ✅ tarefas 1–11; `npm run check` verde (web 115, api 213, rules 38); `vite build` ok. Biome passou a ignorar `*.scss` (o parser dele lê hex como `#0d1015` como unidade) |
| 5. Revisão       | ✅ `reviewer`: aprovado com ressalvas, sem ❌ (`008-visual-placar.review.md`)                                                                                            |
| 6. Entrega       | ✅ tudo staged; commit com o dono                                                                                                                                        |
