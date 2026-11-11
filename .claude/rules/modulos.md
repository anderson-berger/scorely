---
paths:
  - "apps/scorely/api/src/modules/**"
  - "apps/scorely/web/src/modules/**"
  - "apps/scorely/contracts/src/**"
---

# Negócio: o doc do módulo manda

Motivo: [docs/decisions/0010-documentacao-viva-por-modulo.md](../../docs/decisions/0010-documentacao-viva-por-modulo.md).

**Antes de mudar qualquer coisa num módulo, leia o doc dele** em `docs/modules/` (o índice `docs/modules/README.md` liga a pasta ao doc). É lá que estão o que o módulo faz, as regras (`GRP-NN`, `AUTH-NN`, `USR-NN`, `NTF-NN`) e o porquê de cada uma.

- Mudou um comportamento: a regra muda **primeiro no doc**, e o dono aprova esse diff. Depois vêm o contrato, os testes e o código.
- Comportamento que não está no doc não existe para a tarefa. Achou um no código: pare e pergunte se ele entra no doc ou sai do código.
- Doc e código discordando: aponte para o dono. Não "conserte" nenhum dos dois sem perguntar.
- Teste de regra cita o id no nome: `it('GRP-18: ...')`. Check: `checks/modules.test.ts` (todo id citado existe e todo módulo está no índice).
- Regra que sai fica riscada com a data, e o número não é reaproveitado.
- Ao terminar a tarefa, atualize a data de "Conferido com o código" no doc.
