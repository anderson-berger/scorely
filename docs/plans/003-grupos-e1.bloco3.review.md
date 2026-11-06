# Revisão: docs/plans/003-grupos-e1.md (bloco 3)

**Veredito:** aprovado com ressalvas (sem ❌)

## ✅ Respeitou

- `safeRedirect`/`guardDecision` são puros e seguem a ordem do plano (`web/src/app/guard.ts`). O `router.ts` só faz o `loadMe` e chama o guard.
- O redirect sobrevive ao primeiro acesso: o `LoginPage` passa o `redirect` para o perfil, e o `ProfilePage` volta para `safeRedirect(redirect)`.
- `/join/:token` não é pública: aceita o convite e vai para `/groups/<id>`.
- Todos os `.vue` estão em Options API. Os erros saem por `errorMessage`/`issueMessage`, as datas por `formatDateTime`, e as chaves i18n existem em pt-BR e en.
- Tarefa 9: confirmar/desistir só com a lista `open`; cancelar, convite e remover membro só para o dono. Tarefa 10: a Home mostra "meus grupos" com o jogo atual.
- Não há `let`, e o módulo está registrado no router.

## ❌ Violou

(nada)

## ⚠️ Precisa de você

- `useGroupsStore().reset()` não era chamado no logout nem quando a sessão expirava, então a Home podia mostrar os grupos da conta anterior. **Corrigido depois da revisão:** o `reset` do auth store agora limpa os grupos.
- Cancelar o jogo, gerar outro link e remover um membro agora pedem confirmação num diálogo; para isso, o plugin `Dialog` foi ativado. O plano não pedia.
- O login com sessão agora vai para o `redirect` em vez da Home. Isso segue a interface aprovada, mas muda o comportamento antigo.
- O Status do plano mostrava o bloco 2 sem revisão e sem entrega. **Corrigido.**

## Testes

Caso 3 (web): `apps/scorely/web/src/app/guard.test.ts` cobre `safeRedirect` (caminho interno, ausente, null, array, `https://`, `//`, relativo) e `guardDecision`:

- sem sessão → login com redirect;
- login com sessão → volta ao redirect;
- redirect externo → `/`;
- conta nova → perfil com `welcome` e `redirect`, sem laço;
- perfil completo → segue.

As telas ficam no roteiro manual (bloco 4).

## npm run check

Verde: api 143, web 41, lint e check:rules (32).
