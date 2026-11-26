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
