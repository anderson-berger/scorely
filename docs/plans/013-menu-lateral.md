# 013 — Menu lateral (drawer) e tela de Grupos

Pedido do dono (2026-11-09): tirar o botão de voltar das telas e navegar por um menu lateral (left drawer), que vai receber mais itens no futuro. O menu **não lista os grupos**, porque a pessoa pode ter muitos. Ele tem o item **Grupos**, que leva à tela de grupos, e lá os grupos ficam separados entre os que a pessoa **é dona** e os que ela **participa**.

## Objetivo

- Um drawer no `MainLayout`, aberto pelo ☰ do cabeçalho, com os itens de navegação da aplicação: **Grupos**, **Perfil** e **Sair**. Itens novos entram como novas linhas de uma lista só (`navItems`).
- A Home atual ("Meus grupos") vira a **tela de Grupos**, em `/groups`, com duas seções: **Sou dono** e **Participo**. A rota `/` passa a redirecionar para ela.
- O botão de voltar sai da página do grupo e da tela de criar grupo.

Nada muda na api nem no contrato. A separação usa o `ownerId` que o `GET /groups` (`MyGroup`) já devolve.

## Fora de escopo

- Itens futuros do menu (página de notificações, histórico, times).
- Busca ou filtro na tela de Grupos.
- Mudanças nas abas do grupo (plano 012).

## Decisões

| #   | Decisão                                                                                                                                                                                                                                                                                                                                                                                                                                  | Por quê                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| D1  | **Drawer no `MainLayout`** com `q-drawer side="left"`, `behavior="mobile"` abaixo de 1024px (abre sobre a tela e fecha ao escolher um item) e `show-if-above` a partir de 1024px (fica fixo aberto do lado). O ☰ fica à esquerda do logo no cabeçalho e só aparece quando o drawer não está fixo.                                                                                                                                       | o padrão do Quasar para menu lateral responsivo; no celular não toma espaço |
| D2  | **Itens do menu numa lista só**, `navItems()` em `src/layouts/nav.ts`: `{ key, icon, to }` para Grupos (`{ name: 'groups' }`, ícone `groups`) e Perfil (`{ name: 'profile' }`, ícone `person_outline`). Sair fica separado no rodapé do drawer, porque é uma ação e não uma rota. O item ativo é destacado (`q-item` com `:to` e `active-class`); na página de um grupo, **Grupos** fica ativo.                                          | os itens futuros entram nessa lista sem mexer no template                   |
| D3  | **Tela de Grupos**: a `HomePage` vai para `modules/groups/pages/GroupsPage.vue`, na rota `groups` → `/groups`. A rota `''` (`home`) vira um redirect para `{ name: 'groups' }`. Os `{ name: 'home' }` existentes passam a apontar para `groups`, e o logo do cabeçalho também. O `modules/home/` sai.                                                                                                                                    | um nome só para a tela; `/` continua funcionando para quem já tem o link    |
| D4  | **Duas seções**: "Sou dono · N" e "Participo · N", nessa ordem, com os mesmos cards de hoje (placar, estado do jogo, "Você está confirmado"). Uma seção vazia não aparece. Sem nenhum grupo, continua o estado vazio de hoje ("0:0" + criar grupo). A separação é a função pura `splitGroups(groups, userId)` em `modules/groups/groups.ts`, que mantém a ordem que veio da api.                                                         | o pedido do dono; com seções, quem tem poucos grupos vê tudo de uma vez     |
| D5  | **"Criar grupo"** continua como botão no fim da tela de Grupos, como hoje. Não entra no drawer.                                                                                                                                                                                                                                                                                                                                          | é uma ação da tela de grupos; o menu fica só com destinos                   |
| D6  | **Avatar no cabeçalho**: o menu dele (Perfil, Sair) sai. O avatar vira um link para o Perfil. No drawer, o topo mostra o nome e o email de quem está logado.                                                                                                                                                                                                                                                                             | Perfil e Sair ficam num lugar só, o drawer                                  |
| D7  | **Sem botão de voltar** na `GroupPage` e na `GroupCreatePage`. Na `GroupPage`, o `StatusChip` fica sozinho, centralizado acima do nome. Os botões "Voltar ao início" das telas de erro (grupo, convite, link do jogo) continuam, agora como "Ver grupos" (`groups.backToGroups`).                                                                                                                                                        | o pedido do dono; numa tela de erro, o botão é a saída, não navegação       |
| D8  | **Textos novos** em `pt-BR` e `en`: `nav.groups` "Grupos", `nav.profile` "Perfil", `nav.logout` "Sair", `nav.open` "Abrir menu" (aria-label do ☰), `groups.owned` "Sou dono", `groups.joined` "Participo", `groups.backToGroups` "Ver grupos". Saem as chaves sem uso: `layout.profile`, `layout.logout`, `groups.back`, `groups.backHome`, `home.myGroups` (as outras `home.*` do estado vazio vão para `groups.*` com o mesmo texto). | regra de i18n do `web.md`; sem chaves mortas                                |

## Contrato

**Sem mudança.**

## Interface (para os testes)

```ts
// src/modules/groups/groups.ts
export function splitGroups<T extends Pick<MyGroup, 'ownerId'>>(
  groups: T[],
  userId: string | undefined,
): { owned: T[]; joined: T[] };

// src/layouts/nav.ts
export type NavItem = { key: 'groups' | 'profile'; icon: string; to: { name: string } };
export function navItems(): NavItem[];
```

## Casos de comportamento

1. **Separar por dono.** Dados 3 grupos (A dono = eu, B dono = outro, C dono = eu), `splitGroups(…, eu)` → `owned: [A, C]`, `joined: [B]`, na ordem de entrada.
2. **Só participo.** Nenhum grupo meu → `owned: []`, `joined` com todos.
3. **Sem usuário.** `userId` `undefined` → `owned: []`, `joined` com todos (não quebra antes do `loadMe`).
4. **Lista vazia.** `[]` → `{ owned: [], joined: [] }`.
5. **Itens do menu.** `navItems()` → `[groups, profile]`, nessa ordem, com `to.name` `groups` e `profile`.
6. **Rotas.** `/groups` resolve para o nome `groups`. `/` redireciona para `/groups`. `{ name: 'group', params: { id } }` continua resolvendo para `/groups/:id`, e `/groups/new` continua sendo `group-create` (não vira um id).
7. **i18n.** As chaves novas existem em `pt-BR` e `en`, e as que saíram não existem em nenhuma das duas.

Roteiro manual (o dono, no DevTools a 390px e a 1280px):

- Celular: ☰ abre o drawer sobre a tela; tocar em Grupos ou em Perfil navega e fecha o menu; Sair encerra a sessão e vai para o login.
- Desktop: o drawer fica aberto do lado, sem ☰; o item da tela atual fica destacado (na página de um grupo, Grupos).
- Tela de Grupos: com grupos meus e de outros, aparecem "Sou dono" e "Participo" com as contagens; só com grupos de outros, só "Participo"; sem grupos, o estado vazio.
- Página do grupo e criar grupo sem o botão de voltar; o logo e o drawer levam para Grupos.
- Abrir `/` cai em `/groups`. Links antigos (`/groups/:id`, convite, link do jogo) continuam funcionando.
- Avatar do cabeçalho abre o Perfil.

## Tarefas

| #   | Tarefa                                                                                                           | Pronto quando                   | Risco                                                          |
| --- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------- |
| 1   | `splitGroups` e `navItems` (casos 1–5)                                                                           | testes verdes                   | baixo                                                          |
| 2   | Rotas: `groups` em `/groups`, redirect de `/`, `HomePage` → `GroupsPage`, `{ name: 'home' }` → `groups` (caso 6) | `/` cai em `/groups`            | baixo: ordem de `groups/new` e `groups/:id`                    |
| 3   | `GroupsPage` com as duas seções (D4)                                                                             | roteiro da tela de Grupos       | baixo                                                          |
| 4   | `MainLayout`: drawer (D1, D2), ☰, topo com nome e email, avatar como link (D6)                                  | roteiro do celular e do desktop | médio: `show-if-above` com o cabeçalho e as abas presas do 012 |
| 5   | Tirar o voltar da `GroupPage` e da `GroupCreatePage`; telas de erro com "Ver grupos" (D7)                        | roteiro da página do grupo      | baixo                                                          |
| 6   | i18n (D8) e `npm run check`                                                                                      | check verde                     | baixo                                                          |

## Perguntas

1. **Seções ou abas na tela de Grupos (D4)?** Recomendo seções ("Sou dono" e depois "Participo", numa rolagem). Abas escondem metade dos grupos atrás de um toque e fazem mais sentido só se as listas ficarem longas.
2. **Perfil e Sair saem do avatar e vão para o drawer (D6)?** Recomendo que sim, para ficarem num lugar só.
3. **Drawer fixo aberto no desktop (D1)?** Recomendo que sim. No celular ele sempre abre pelo ☰.
4. **"Criar grupo" só na tela de Grupos (D5)**, ou também como item do drawer? Recomendo só na tela.

## Ajuste do dono (2026-11-09, depois da entrega)

O dono testou no desktop (print a 1840px) e achou ruim. O que estava errado:

- **Dois centros diferentes.** O cabeçalho centralizava uma faixa de 480px na janela inteira, então o logo ficava no meio da tela. O conteúdo centralizava no espaço à direita do drawer. O logo e a página não se alinhavam.
- **Título colado no cabeçalho.** O `.sc-page` não tem respiro em cima.
- **Drawer de 264px para dois itens.** Sobrava coluna vazia.
- O dono pediu: **"tão bem no mobile quanto no desktop"** e **"deixa o perfil no header"**.

Decisões que substituem D1, D2 e D6:

| #   | Decisão                                                                                                                                                                                                                                                                                                                                                    | Por quê                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| D9  | **Cabeçalho de aplicação, largura total**: à esquerda ☰ + logo, à direita sino + avatar, com 16px de margem lateral (24px a partir de 1024px). Sem a faixa de 480px centralizada.                                                                                                                                                                         | o logo fica alinhado com o menu; o cabeçalho não depende da largura do conteúdo               |
| D10 | **Drawer em trilho no desktop**: a partir de 1024px, o drawer fica sempre visível no modo `mini` (só ícones, 64px, com tooltip). O ☰ expande e recolhe para 240px, e a escolha fica salva no navegador (`localStorage`, com try/catch). Abaixo de 1024px, continua como hoje: abre sobre a tela pelo ☰ e fecha ao escolher um item. O ☰ aparece sempre. | no desktop o menu não come espaço; no celular nada muda                                       |
| D11 | **Perfil no cabeçalho (substitui D6)**: o avatar abre um menu com nome e email, "Perfil" e "Sair". O drawer fica só com a navegação (`navItems()` → `[groups]`) e sem o topo com nome e email.                                                                                                                                                             | o pedido do dono; a conta fica num lugar só, e o drawer é só para ir a lugares                |
| D12 | **Respiro do conteúdo**: `.sc-page` ganha 16px em cima (24px a partir de 1024px). A coluna continua com 480px, centralizada na área ao lado do drawer.                                                                                                                                                                                                     | o título deixa de encostar no cabeçalho; formulário e cards largos demais ficam piores de ler |

Notas da implementação do ajuste:

- **D9, margem esquerda no desktop:** 10px em vez de 24px, para o ☰ (44px) ficar centralizado no trilho de 64px (10 + 44 + 10) e alinhado com os ícones dele. A direita ficou com 24px.
- **D10, fechar no celular (pedido do dono depois do ajuste):** o drawer do celular cobre o cabeçalho e o ☰. Ganhou no topo o logo e um botão ✕ (`nav.close` "Fechar menu"); a faixa escura continua fechando também.
- **D11, `nav.account`:** chave nova ("Conta" / "Account"), usada como `aria-label` do avatar no lugar da `layout.account`, que saiu.

Caso 5 passa a ser: **Itens do menu.** `navItems()` → `[groups]`, com `to.name` `groups` e ícone `groups`. Novo caso 8: **Preferência do trilho.** `readRailExpanded(storage)` devolve `false` sem valor salvo, sem storage ou quando o storage lança erro, e `true` só com `'1'`; `storeRailExpanded(storage, v)` grava `'1'`/`'0'` e não lança erro se o storage falhar (em `src/layouts/nav.ts`).

Roteiro manual do ajuste (390px, 1024px e 1840px):

- 1840px: logo à esquerda alinhado com o trilho; o ☰ expande o trilho e recolhe; ao recarregar, continua como estava; o tooltip mostra o nome do item recolhido.
- 390px: o ☰ abre o drawer sobre a tela; Grupos navega e fecha.
- O avatar abre nome/email, Perfil e Sair nos dois tamanhos.
- O título das páginas não encosta no cabeçalho.

> **Substituído depois (plano 015, D18):** a preferência salva do trilho (D10 do ajuste e caso 8) saiu. No desktop, o ☰ agora expande o menu por cima do conteúdo e ele não abre sozinho ao carregar; `readRailExpanded` e `storeRailExpanded` não existem mais.

## Status

| Passo            | Estado                                                                                                                                                                                                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Plano         | ✅ aprovado (2026-11-09): seções, Perfil e Sair no drawer, drawer fixo no desktop, criar grupo só na tela                                                                                                                                                                         |
| 2. Contrato      | ✅ sem mudança; `npm run typecheck` verde                                                                                                                                                                                                                                         |
| 3. Testes        | ✅ `test-writer`: casos 1–4 (`groups.test.ts`), 5 (`nav.test.ts`), 6 (`routes.test.ts`), 7 (`locales.test.ts`; a lista do 008 passou de `home.*` para `groups.*`). 1–6 já passavam porque `nav.ts`, `groups.ts` e as rotas foram escritos junto com os testes                     |
| 4. Implementação | ✅ tarefas 1–6; web 178, api 235, rules 56 verdes; `vite build` ok. `npm run lint` só falha no `011-modelador-de-dados.md` (fora da tarefa). Saíram também `layout.account` e `home.*` inteiros (sem uso)                                                                         |
| 5. Revisão       | ✅ `reviewer`: aprovado com ressalvas, sem ❌ (`013-menu-lateral.review.md`)                                                                                                                                                                                                      |
| 6. Entrega       | ✅ ajuste do dono (D9–D12) aprovado e implementado: casos 5 e 8 reescritos pelo `test-writer`; web 185, api 235, base 12, rules 56 verdes; `vite build` ok; `reviewer`: aprovado com ressalvas, sem ❌ (2ª seção do `013-menu-lateral.review.md`); tudo staged, commit com o dono |
