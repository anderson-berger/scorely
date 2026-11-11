# Revisão: docs/plans/013-menu-lateral.md

**Veredito:** aprovado com ressalvas

## ✅ Respeitou

- Interface `splitGroups`, que mantém a ordem e devolve `owned: []` sem userId (D4, casos 1–4) → `apps/scorely/web/src/modules/groups/groups.ts:4-10`
- `navItems` com Grupos e Perfil, `to.name` e ícones como em D2 → `apps/scorely/web/src/layouts/nav.ts:2-8`
- D3: redirect de `''` para `groups`, rota `/groups` declarada antes de `groups/new` e de `groups/:id` → `apps/scorely/web/src/modules/groups/routes.ts:5-6`. `modules/home/` apagado e `homeRoutes` saiu do `app/router.ts`. Não sobrou nenhum `name: 'home'`.
- D1: drawer com `:breakpoint="1023"` e `show-if-above`. O ☰ só aparece com `!fixed` (`$q.screen.gt.sm`) → `MainLayout.vue:94`, `:32-35`
- D2: Grupos fica ativo nas rotas do grupo → `MainLayout.vue:11`, `:47-50`. Sair fica no rodapé e não é rota → `MainLayout.vue:115-120`
- D6: o avatar virou link para o Perfil → `MainLayout.vue:82-89`. O logo leva a Grupos → `MainLayout.vue:76`. O topo do drawer mostra nome e email.
- D4: seção vazia não aparece, título com "· N" → `GroupsPage.vue:42-47`
- D7: não sobrou botão de voltar nas páginas de `groups/pages`. O `StatusChip` fica sozinho e centralizado → `GroupPage.vue:172-174`, `:234-236`. As telas de erro usam "Ver grupos" → `GroupPage.vue:168`, `JoinPage.vue:30`, `PlayPage.vue:80`
- D8: as chaves novas estão nas duas línguas → `pt-BR.ts:133-137` e `en.ts:123-127`. `layout.*` e `home.*` saíram.
- Web: Options API (`defineComponent`) e erro traduzido por `errorMessage` → `GroupsPage.vue:55`
- Escopo: nenhuma mudança na api nem no contrato vem deste plano.

## ❌ Violou

- (nada)

## ⚠️ Precisa de você

- `layout.account` e todo o `home.*` (incluindo `home.gotLink`) saíram, o que vai um pouco além da lista de D8. A Status do plano registra isso e as chaves estavam sem uso, mas o plano não pedia essa remoção.
- O índice mistura os planos 008, 010, 012 e 013 (por exemplo `GroupCreatePage.vue`, `GroupPage.vue` e `routes.ts` têm mudanças do 012). Este plano foi revisado sozinho, então a mensagem de commit precisa deixar isso claro.
- Há mudança não staged em `apps/scorely/web/src/modules/users/pages/ProfilePage.vue` (foto de perfil, plano 010). Ela é de outro plano, e o 013 não toca esse arquivo.
- `npm run check:rules` não rodou: o `check` encadeia com `&&` e parou no lint (veja abaixo).

## Testes

| Caso           | Teste                                                                         | Observação                                                               |
| -------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1–4            | `apps/scorely/web/src/modules/groups/groups.test.ts`                          | ok                                                                       |
| 5              | `apps/scorely/web/src/layouts/nav.test.ts`                                    | ok                                                                       |
| 6              | `apps/scorely/web/src/modules/groups/routes.test.ts` (bloco "tela de Grupos") | o redirect é conferido pelo `resolve`, sem navegar (as páginas são lazy) |
| 7              | `apps/scorely/web/src/i18n/locales.test.ts:117-170`                           | ok                                                                       |
| roteiro manual | —                                                                             | fica com o dono (390px e 1280px)                                         |

Nenhum `*.test.ts` foi alterado depois de entrar no índice: `git diff` não mostra nenhum.

## npm run check

Vermelho, mas não por este plano: typecheck verde; testes verdes (web 178, scorely/api 235, base/api 12). O lint dá 2 erros de formatação em arquivos que ainda não estão no git e ficam fora do 013: `docs/plans/011-modelador-de-dados.md` e `docs/plans/012-local-no-mapa.md`. Como o lint falhou, `check:rules` não rodou.

---

# Revisão do ajuste do dono (D9–D12, casos 5 e 8)

**Veredito:** aprovado com ressalvas

## ✅ Respeitou

- D9: o cabeçalho ocupa a largura toda, com ☰ e logo à esquerda e sino e avatar à direita. A faixa de 480px saiu. Evidência: `MainLayout.vue:96-130`.
- D10: trilho `mini` de 64px a partir de 1024px (`show-if-above`, `:breakpoint="1023"`), tooltip só no modo mini, ☰ sempre visível. O ☰ alterna `expanded` e grava a escolha. No celular, o drawer abre, fecha e fecha ao navegar. O storage fica em try/catch (`browserStorage()`, `readRailExpanded`, `storeRailExpanded` em `nav.ts:14-29`).
- D11: o avatar abre um `q-menu` com nome e email, Perfil e Sair. `navItems()` devolve só `[groups]`.
- D12: `.sc-page` tem 16px em cima e 24px a partir de 1024px. A coluna continua com 480px (`app.scss:36-47`).
- web.md: Options API, nenhum `let` e nenhum `err.message`. Nada na api nem no contrato.

## ❌ Violou

- Nada.

## ⚠️ Precisa de você

- D9: a margem esquerda ficou com 10px em vez de 24px (`MainLayout.vue:185`), para centralizar o ☰ no trilho. **Anotado no plano.**
- Chave nova `nav.account` como aria-label do avatar. Não estava no D8 nem no D11, mas o check de paridade das duas línguas cobre. **Anotado no plano.**

## Testes

| Caso           | Teste                       | Observação                                                                            |
| -------------- | --------------------------- | ------------------------------------------------------------------------------------- |
| 5              | `layouts/nav.test.ts:26-35` | só `groups`, com `to.name` e ícone                                                    |
| 8              | `layouts/nav.test.ts:38-78` | sem valor, sem storage, storage que lança, `'1'`, `'0'`, outro valor, falha ao gravar |
| roteiro manual | —                           | com o dono, a 390, 1024 e 1840px                                                      |

## npm run check

typecheck e testes verdes (web 185, api 235, base 12). `check:rules` verde rodando à parte (56). O lint falha só em `docs/plans/011-modelador-de-dados.md`, que não é tracked e é de fora da tarefa.
