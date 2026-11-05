---
name: task
description: Conduz uma tarefa pelo fluxo do repo — plano (para e espera aprovação), contrato, testes pelo test-writer, implementação, revisão pelo reviewer e tudo staged para o dono commitar. Use quando o dono pedir uma funcionalidade, correção ou mudança com /task <pedido>.
---

# /task <pedido>

Fluxo fixo, com paradas. O status de cada passo fica no próprio plano (seção `## Status`), para dar para retomar se a sessão cair: ao começar, procure em `docs/plans/` um plano do mesmo pedido com status incompleto e continue de onde parou.

## 1. Plano (para aqui)

1. Leia `docs/product/PRODUCT.md` (para cortar escopo), as regras das áreas envolvidas (`.claude/rules/`) e os ADRs relevantes (`docs/decisions/README.md`).
2. Crie `docs/plans/NNN-slug.md` (próximo número) com: objetivo; fora de escopo; decisões e porquê; contrato (rotas, schemas, erros); **casos de comportamento** (dado/quando/então, numerados); tarefas (≤ 1h, cada uma testável, com "pronto quando" e risco); perguntas que bloqueiam; `## Status` com os 6 passos.
3. **Pare.** Mostre o resumo e as perguntas. Só siga quando o dono disser que aprovou. Ajustes pedidos → atualize o plano e pare de novo.

## 2. Contrato

Schemas Zod (scorely: `@scorely/contracts`; base: `<mod>.schema.ts` idêntico na api e no web), erros novos nos 4 lugares (enum, `CATALOG`, details, i18n), tipos de notificação + ícone. Portão: `npm run typecheck` verde. Marque no Status.

## 3. Testes

Chame o subagente `test-writer` passando **só** o caminho do plano (não resuma a implementação que você tem em mente). Confira o relatório: todo caso tem teste ou justificativa; os testes falham por falta de implementação; estão staged. Marque no Status.

## 4. Implementação

Implemente seguindo as tarefas do plano. **Não altere os testes staged.** Se um teste parecer errado, pare e pergunte ao dono. Portão: `npm run check` verde.

## 5. Revisão

Chame o subagente `reviewer` passando só o caminho do plano. Grave a resposta dele em `docs/plans/NNN-slug.review.md`. Com ❌: corrija e chame o reviewer de novo. Os ⚠️ ficam para o dono.

## 6. Entrega

`git add` de tudo da tarefa (inclusive plano e review). **Não commite** (a permissão nega). Termine com:

- o veredito e os ⚠️ do reviewer;
- `npm run check`: resultado;
- a mensagem de commit sugerida (Conventional Commits, em pt-BR);
- o que o dono precisa testar à mão (roteiro do plano, se houver).
