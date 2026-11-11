---
name: task
description: Conduz uma tarefa pelo fluxo do repo — mudança no doc vivo do módulo (para e espera aprovação), contrato, testes pelo test-writer, implementação, revisão pelo reviewer e tudo staged para o dono commitar. Use quando o dono pedir uma funcionalidade, correção ou mudança com /task <pedido>.
---

# /task <pedido>

O guia da tarefa é o **doc vivo do módulo** (`docs/modules/<modulo>.md`, índice em `docs/modules/README.md`, ADR 0010). A proposta que o dono aprova é o diff desse doc. Não crie arquivos em `docs/plans/`: lá é só histórico.

O andamento fica em `.claude/work/<slug>.md` (fora do git): o pedido, os docs e as regras afetadas, as tarefas, as perguntas, o roteiro manual, a `## Status` com os 6 passos e o relatório do reviewer. Ao começar, procure ali uma tarefa do mesmo pedido com status incompleto e continue de onde parou. Se o pedido retoma um plano pendente de `docs/plans/` (status "aguardando aprovação"), converta esse plano para este fluxo: as regras vão para o doc e as tarefas para o arquivo de trabalho.

## 1. Proposta no doc (para aqui)

1. Leia o doc de cada módulo envolvido, `docs/product/PRODUCT.md` (para cortar escopo), as regras das áreas (`.claude/rules/`) e os ADRs relevantes.
2. Confira no código se o doc bate com o que existe hoje. Divergência: aponte para o dono antes de propor qualquer coisa.
3. **Edite o doc** com o que muda no negócio:
   - regra nova com o próximo número;
   - regra alterada no mesmo número;
   - regra removida riscada com a data;
   - o _Por quê_ de cada uma;
   - as seções "Como funciona" (rotas, dados, erros), "Limites" e "Em discussão", se mudarem.
   - Módulo novo: crie o doc a partir de `docs/modules/_template.md` e acrescente a linha no índice.
   - Tarefa sem mudança de negócio (infra, ambiente, visual sem regra nova): o doc não muda. Diga isso, e uma decisão técnica estrutural vira ADR.
4. Escreva `.claude/work/<slug>.md` com:
   - as regras afetadas (ids);
   - as tarefas (≤ 1 h cada, com "pronto quando" e risco);
   - as perguntas que bloqueiam;
   - o roteiro manual, se houver tela;
   - a `## Status`.
5. **Pare.** Mostre o diff do doc (`git diff docs/modules` ou o arquivo novo), as decisões técnicas que não estão no doc e as perguntas. Só siga quando o dono disser que aprovou. Se ele pedir ajustes, mude o doc e pare de novo.

## 2. Contrato

- Schemas Zod: no scorely, em `@scorely/contracts`; no base, `<mod>.schema.ts` idêntico na api e no web.
- Erros novos nos 4 lugares (enum, `CATALOG`, details, i18n).
- Tipos de notificação, com o ícone.
- Portão: `npm run typecheck` verde. Marque no Status.

## 3. Testes

Chame o subagente `test-writer` passando **só** o caminho do arquivo de trabalho, que aponta para o doc e para os ids afetados. Não resuma a implementação que você tem em mente.

Confira o relatório:
- toda regra afetada tem teste ou justificativa;
- os testes falham por falta de implementação;
- os testes estão staged.

Marque no Status.

## 4. Implementação

- Implemente seguindo as tarefas.
- **Não altere os testes staged.** Se um teste parecer errado, pare e pergunte ao dono.
- Se a implementação mostrar que uma regra do doc não se sustenta, pare e proponha a mudança no doc. Nunca deixe o código diferente do doc.
- Atualize a data de "Conferido com o código" nos docs tocados.
- Portão: `npm run check` verde.

## 5. Revisão

- Chame o subagente `reviewer` passando só o caminho do arquivo de trabalho.
- Grave a resposta dele na seção `## Revisão` desse arquivo.
- Com ❌: corrija e chame o reviewer de novo.
- Os ⚠️ ficam para o dono.

## 6. Entrega

`git add` de tudo da tarefa, inclusive o doc do módulo. O arquivo de trabalho fica fora (está no `.gitignore`). **Não commite** (a permissão nega).

Termine com:
- as regras que mudaram (ids, em uma linha cada);
- o veredito e os ⚠️ do reviewer;
- o resultado do `npm run check`;
- a mensagem de commit sugerida, em Conventional Commits e pt-BR, citando os ids das regras;
- o que o dono precisa testar à mão.
