# 0010: documentação viva por módulo no lugar de planos

- Data: 2026-11-10
- Estado: aceita

## Contexto

Até aqui, toda tarefa gerava um plano em `docs/plans/NNN-slug.md`. Isso juntou 16 planos e reviews, com mais de 3.000 linhas. As regras de negócio ficaram espalhadas por eles: o 007 mudou regras do 003, o 013 mudou o modelo de membros. Para saber como algo funciona hoje, era preciso ler vários planos em ordem, e na prática a IA deduzia o negócio a partir do código. O `PRODUCT.md` também ficou desatualizado: ainda marcava a E2 como não feita.

## Decisão

- Cada módulo tem um **documento vivo** em `docs/modules/<modulo>.md`, que descreve o estado atual: o que faz, as regras numeradas (`GRP-NN`...) e o porquê de cada uma, além de um resumo de como funciona.
- No `/task`, a proposta é **o diff do doc do módulo**. O dono aprova esse diff, e só depois vêm o contrato, os testes e o código.
- A lista de tarefas, o status e o relatório do reviewer ficam em `.claude/work/<slug>.md`, fora do git. Servem só para retomar uma tarefa que caiu.
- `docs/plans/` fica como histórico, só para leitura. Nenhum plano novo é criado lá.
- Os testes citam o id da regra, e um check confere que o id existe.

## Por quê

O guia da IA (e de quem chega) precisa ser **o estado atual do negócio**, não o histórico de mudanças. Um documento que é editado a cada tarefa não envelhece. Já um documento que é acumulado a cada tarefa envelhece sempre.

## Consequências

- Toda mudança de comportamento edita o doc do módulo. Se não editou, ou a tarefa não muda o comportamento, ou falta regra no doc.
- O "porquê" de uma regra vive ao lado da regra. O ADR fica para as decisões técnicas que valem para o repo inteiro.
- O registro de quando e por que uma regra mudou passa a ser o `git log` do doc e a mensagem de commit.
- Regra: `.claude/rules/modulos.md`. Check: `checks/modules.test.ts`.
