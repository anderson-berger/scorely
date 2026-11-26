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
