---
paths:
  - "apps/*/web/**"
---

# Web: visual

O guia visual cresce uma correção por vez, cada uma validada pelo dono. Para conferir, use `/screens` ([ADR 0023](../../docs/decisions/0023-revisao-visual-por-prints.md)).

## Três faixas de largura

| Faixa   | Largura      | `$q.screen` | Menu do app                                                | Áreas do grupo |
| ------- | ------------ | ----------- | ---------------------------------------------------------- | -------------- |
| celular | até 599px    | `xs`        | cabeçalho; ☰ com o conteúdo da barra, por cima da tela     | abas           |
| tablet  | 600 a 1023px | `sm`        | barra lateral só com ícones (72px), sem cabeçalho          | abas           |
| desktop | 1024px ou +  | `gt.sm`     | barra lateral com ícones e nomes (240px), sem cabeçalho    | abas           |

- Os cortes são só `min-width: 600px` e `min-width: 1024px`. Não crie outro.
- A partir de 600px o layout **não é o do celular**: o conteúdo (`.sc-page`) usa a largura que sobra. Formulário não estica: limite a largura dele.
- Check (`checks/web-visual.test.ts`): `@media` só com `(min-width: 600px)` ou `(min-width: 1024px)`; `$q.screen` (e `Screen` importado) só `xs`, `sm`, `gt.xs`, `gt.sm`, `lt.sm`, `lt.md` e `width`.

## Menus (GRV-13, ADR 0024)

- A partir de 600px, a **barra lateral** (`layouts/AppSidebar.vue`) fica fixa à esquerda e é a **única coluna fixa**. No topo, o logo, o sino e a conta; sem rodapé e sem busca.
- O conteúdo da barra e do ☰ é um só (`layouts/SidebarLinks.vue`): a seção "Meus" (itens em `navItems`, `layouts/nav.ts`) e os atalhos dos grupos (`groupRailItems`, `layouts/rail.ts`). Área geral nova entra em "Meus". Criar coisa fica na tela dela, não na barra.
- As áreas de uma coisa (as do grupo, `GroupNav`) ficam em **abas** dentro da página dela, abaixo do topo, em todas as larguras. As que não cabem rolam para o lado.
- Menu que abre da barra (sino, conta) abre para o lado (`side="right"`).
- No celular, o drawer do ☰ sempre abre por cima da tela, sem empurrar o conteúdo.
- Item de navegação só com ícone tem o nome no `aria-label` e num tooltip, com alvo de 44px ou mais.

## Botões

A base fica em `css/app.scss`. No `.vue`, escolha só o tamanho e o tipo: **sem altura, raio ou fonte de botão em estilo local**.

| Tamanho  | Até 599px | 600px ou + | Como    | Onde                                          |
| -------- | --------- | ---------- | ------- | --------------------------------------------- |
| normal   | 48px      | 40px       | padrão  | rodapé de painel, ação da tela, topo da lista |
| compacto | 44px      | 36px       | `dense` | linhas de lista, voltar, "Editar"             |

| Tipo       | Aparência        | No `q-btn`                                          | Uso                                   |
| ---------- | ---------------- | --------------------------------------------------- | ------------------------------------- |
| principal  | verde preenchido | `unelevated color="primary" class="sc-btn-main"`    | no máximo um por tela ou painel       |
| secundário | contorno cinza   | `flat class="sc-btn-outline"`                       | as outras ações                       |
| texto      | sem contorno     | `flat`                                              | cancelar a edição, voltar, "ver mais" |
| perigo     | texto vermelho   | `flat color="negative"`                             | apagar, sair, cancelar partida        |

- Barlow só no principal (18px até 599, 16px a partir de 600); os outros, Inter 14px. Ícone de 20px.
- Botão só de ícone (`round`) tem pelo menos 44px nas duas faixas e o nome no `aria-label`.
- No celular o botão pode ocupar a largura toda (`:class="{ 'full-width': $q.screen.xs }"`). A partir de 600px ele fica do tamanho do texto, menos no login. Cuidado com o pai em coluna flex ou grade, que estica.
- Botão de escolha (como "Vou" e "Não vou") não é o principal: não leva `sc-btn-main`.
- Check (`checks/web-visual.test.ts`): nenhum seletor `.q-btn` (fora `.q-btn-group`, `-dropdown` e `-toggle`) nem `.sc-btn-*` no `<style>` de `.vue`; nenhum `size` em `q-btn`; `round` ou só ícone (sem `label` e sem texto no slot; `q-tooltip` não conta) exige `aria-label`.

## Painéis (GRV-07)

Todo painel é o `BottomSheet` (`src/components/BottomSheet.vue`); a forma por faixa fica nele, não no uso.

| Faixa      | Posição          | Forma                                                   | Fechar                |
| ---------- | ---------------- | ------------------------------------------------------- | --------------------- |
| até 599px  | pé da tela       | alça no topo, cantos só em cima, largura toda           | arrastar, tocar fora  |
| 600px ou + | centro da tela   | sem alça, borda e cantos nos quatro lados, até 480px    | X, Esc, clique fora   |

- Nas duas faixas, no máximo 85vh; o que não cabe rola dentro do painel.
- `persistent` (salvando, boas-vindas) tira o X e impede fechar por fora ou pelo Esc.
- O slot `action` fica ao lado do X; título longo quebra linha, não passa por baixo dele.
- Não crie posição, largura ou alça no `.vue` que usa o painel.
- Check (`checks/web-visual.test.ts`): `<q-dialog>` e `QDialog` só em `components/BottomSheet.vue`. A confirmação pelo plugin (`this.$q.dialog({ ... cancel: true })`) não é painel e fica fora.

## Login

A tela de login (`modules/auth/pages/LoginPage.vue`) fica fora do layout do app, sem barra nem cabeçalho.

| Faixa       | Forma                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------- |
| até 1023px  | uma coluna centrada: marca e slogan centrados, 32px até o form, form até 400px; sem quadra e sem cartão        |
| 1024px ou + | tela dividida em duas metades: à esquerda o painel da marca (`--sc-surface`, borda à direita), com a quadra inteira e a marca abaixo dela, alinhadas à esquerda; à direita o form, até 360px, centrado |

- A quadra só aparece inteira, no painel da marca. Nunca atrás do form nem cortada.
- O form não fica em cartão: o painel da marca já separa as duas áreas.
- O botão principal ocupa a largura do form. Os links do passo do código ("Trocar email", "Reenviar") são botões de texto a 16px do botão (`q-mt-md`).
- Texto com `@` no i18n (como o exemplo do email) escapa o `@` como `{'@'}`: sem isso o vue-i18n quebra a tela.
  Check: `checks/web.test.ts` compila todo texto de `pt-BR` e `en` com o compilador do vue-i18n.

## Página com ações

A referência é a página da partida (`modules/groups/matches/pages/MatchPage.vue`).

- A ordem, de cima para baixo: a resposta de quem vê (como "Vou" e "Não vou") → as ações de quem organiza, num bloco só, com o principal primeiro → o conteúdo (resultado, times, listas) → copiar e compartilhar, numa linha → as configurações → a ação de perigo por último, 24px abaixo das configurações.
- As ações do mesmo papel ficam **num bloco só** (uma linha que quebra), nunca um bloco por botão.
- O bloco de quem organiza só aparece se houver alguma ação nele; nenhum bloco vazio.
- Até 599px, os botões de escolha dividem a linha meio a meio, e a ação ao lado deles (como "Trazer convidado") vira botão de texto embaixo. A partir de 600px, ficam na mesma linha.
- A partir de 600px, a página fica em até 720px, alinhada à esquerda: lista de configurações não estica até a borda.

## Toques

- Até 599px, todo alvo de toque (link, aba, campo, chave de ligar) tem 44px ou mais de altura. O `/screens` mede isso (`touchTargetMin`).
- A altura de campo e de chave fica na base (`css/app.scss`): campo `dense` e `q-toggle` com 44px até 599px; a partir de 600px, o campo compacto volta aos 40px. Sem altura de campo ou de chave em estilo local.
- Abas dentro da página (`q-tabs`, como Próximas/Anteriores) não usam `dense`.
- Check (`checks/web-visual.test.ts`): `q-tabs` sem `dense`; nenhum seletor `.q-field`, `.q-toggle` ou `.q-input` no `<style>` de `.vue`.
- Link só de texto que funciona como botão (como o logo do cabeçalho) ganha `min-height: 44px` com `display: inline-flex` e centro na vertical.

## Ícones

- Só ícones do **Material Icons**, a única fonte carregada (`src/main.ts`). Nome só do Material Symbols (como `shield_person`) aparece como texto cru.
- Antes de usar um nome, confira em `@quasar/extras/material-icons/icons.json` (`matAdminPanelSettings` = `admin_panel_settings`). O nome é só minúscula, número e `_`.
- Check: `checks/web-visual.test.ts` lê `icon="..."`, `*-icon="..."`, `icon-*="..."`, `<q-icon name="...">`, os literais de `:icon`/`:name`, `icon: '...'` no script e os valores dos mapas `*.icons.ts`.
