# Revisão: docs/plans/007-grupos-e2.md (bloco 2: web, tarefas 8 e 9)

**Veredito:** aprovado com ressalvas (sem ❌)

## ✅ Respeitou

- Options API na ordem, `computed` com retorno tipado (`PlayPage.vue`, `GameCard.vue`, `LayersCard.vue`, `GroupLinksCard.vue`).
- Erros por `errorMessage`/`issueMessage`; datas por `formatDateTime`.
- `links.ts` com `inviteUrl`, `playRedirect` e `listGate` da interface; `groupsApi` com `update`, `rotateInvite(id, kind)`, `play`, `playConfirm`, `playLeave` usando os schemas do contracts.
- Rota `play/:token` não pública (o guard manda para o login com `redirect`).
- Página do grupo: 3 links com copiar/trocar (convidado só com convidados ligados), "gerar" para token ausente (D6), papel na lista do jogo e na de membros, camadas editáveis só pelo dono.
- "Criar grupo": interruptor de convidados; desligado, o campo não vai.
- i18n completo em pt-BR e en; chaves removidas sem uso. Sem `let`; api e DynamoDB intocados.

## ❌ Violou

(nada)

## ⚠️ Precisa de você

- O plano ganhou `playRedirect` e `listGate` na Interface e no caso 16 depois da aprovação (só web, sem mudar contrato).
- ~~Padrão de reservas fixo em 24 no "criar grupo"~~ — **corrigido depois da revisão**: o campo segue a metade da antecedência dos membros até a pessoa mexer nele (`GroupCreatePage.vue`, `watch.listOpensHoursBefore`).
- O card "Abertura da lista" aparece para todos (membros e reservas veem os horários das 3 camadas); só a edição é do dono.
- Na `PlayPage`, confirmar/desistir não pede confirmação (igual à E1). O `listGate` usa a hora do momento da renderização: os botões só aparecem ao recarregar quando a camada abre.

## Testes

Caso 16: `links.test.ts` (`inviteUrl` 4, `playRedirect` 3, `listGate` 7). As telas ficam no roteiro manual (bloco 3). Nenhum teste alterado depois de staged.

## npm run check

Verde: typecheck, test (web 55), lint (200 arquivos), check:rules (32).
