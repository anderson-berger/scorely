# docs

Onde procurar cada coisa. Abra só a camada que a tarefa pede.

| Camada                                                     | O que tem                                                                                                                   | Quando ler                                                      |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| [`product/PRODUCT.md`](product/PRODUCT.md)                 | por que o produto existe, público, MVP, módulo Grupos (visão, vocabulário, entregas E1–E6, limites), o que fica para depois | ao planejar: para cortar escopo e entender o "por quê"          |
| [`decisions/`](decisions/README.md)                        | ADRs curtos (contexto, decisão, porquê, consequências)                                                                      | antes de mudar algo que parece estranho, ou ao propor uma troca |
| [`plans/`](plans/)                                         | planos (`NNN-slug.md`) e relatórios de revisão (`.review.md`)                                                               | ao executar ou revisar uma tarefa                               |
| [`context/PROJECT_CONTEXT.md`](context/PROJECT_CONTEXT.md) | mapa do repo para quem chega de fora                                                                                        | para uma visão geral; não é fonte de regra                      |
| [`../.claude/rules/`](../.claude/rules/)                   | regras por área, carregadas sozinhas ao tocar os arquivos da área                                                           | a IA lê automaticamente; humanos, ao revisar                    |
| [`../checks/`](../checks/)                                 | regras verificadas por máquina (`npm run check:rules`)                                                                      | quando um check falhar                                          |
