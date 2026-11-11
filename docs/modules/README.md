# Módulos

**A fonte de verdade do negócio.** Cada módulo tem um documento vivo que descreve o que ele faz, como faz e por quê, do jeito que funciona **hoje**. A decisão de trocar planos por documentos vivos está no [ADR 0010](../decisions/0010-documentacao-viva-por-modulo.md).

| Módulo (pasta em `apps/<projeto>/api/src/modules/`) | Doc                                | Prefixo das regras |
| --------------------------------------------------- | ---------------------------------- | ------------------ |
| `scorely/groups`                                    | [grupos.md](grupos.md)             | `GRP`              |
| `scorely/auth`                                      | [auth.md](auth.md)                 | `AUTH`             |
| `scorely/users`                                     | [usuarios.md](usuarios.md)         | `USR`              |
| `scorely/notifications`                             | [notificacoes.md](notificacoes.md) | `NTF`              |
| `scorely/media`                                     | [midia.md](midia.md)               | `MID`              |
| `scorely/teams`                                     | [times.md](times.md)               | `TIM`              |
| `scorely/health`                                    | —                                  | —                  |

O `base` é template e não tem doc de módulo. Um módulo sem regra de negócio, como o `health`, fica na tabela com "—".

## Como usar

- **Antes de mudar um módulo, leia o doc dele.** A regra `.claude/rules/modulos.md` lembra a IA disso sempre que um arquivo do módulo é tocado.
- **Toda mudança de comportamento começa no doc.** A regra nova, alterada ou removida, com o porquê, é o que o dono aprova no `/task`. Só depois disso vêm o contrato, os testes e o código.
- **Os ids das regras são fixos.** Regra nova recebe o próximo número. Regra que sai fica riscada com a data (`~~GRP-12. ...~~ removida em 2026-12-01: <motivo>`), e o número não volta a ser usado.
- **Os testes citam o id** no nome (`it('GRP-18: membro que confirma com a lista cheia vai para a fila', ...)`). O check `checks/modules.test.ts` confere que todo id citado existe.
- **Código e doc discordando é bug,** em um dos dois. Corrija o que estiver errado, e nunca deixe os dois diferentes.

## Formato

Use o [\_template.md](_template.md). As seções são sempre estas:

1. **Para que serve:** o objetivo, o caso de referência e o vocabulário.
2. **Regras de negócio:** numeradas (`<PREFIXO>-NN`). Cada uma diz o que acontece e o erro devolvido e, quando houver uma decisão por trás, traz o _Por quê_.
3. **Como funciona:** os itens no banco, onde está cada regra no código, e as rotas com as regras que cumprem. É um resumo: os detalhes ficam nos comentários do código e no contrato.
4. **Limites conhecidos.**
5. **Em discussão (opcional):** o que foi proposto e ainda não é regra.

O que **não** vai no doc: passo a passo de implementação, lista de tarefas, status ou histórico de mudanças (esse fica no `git log` do arquivo). Decisão técnica que vale para o repo inteiro vai para um ADR em [`decisions/`](../decisions/README.md).
