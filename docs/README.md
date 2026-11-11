# docs

Onde procurar cada coisa. Abra só a camada que a tarefa pede.

| Camada                                                     | O que tem                                                                                                | Quando ler                                                          |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [`modules/`](modules/README.md)                            | **a fonte de verdade do negócio**: um doc vivo por módulo, com o que faz, as regras numeradas e o porquê | sempre, antes de mexer num módulo; é o que o dono aprova no `/task` |
| [`product/PRODUCT.md`](product/PRODUCT.md)                 | por que o produto existe, público, entregas (E1–E6), o que fica para depois                              | ao planejar: para cortar escopo                                     |
| [`decisions/`](decisions/README.md)                        | ADRs curtos de decisões técnicas do repo (contexto, decisão, porquê, consequências)                      | antes de mudar algo que parece estranho, ou ao propor uma troca     |
| [`context/PROJECT_CONTEXT.md`](context/PROJECT_CONTEXT.md) | mapa do repo para quem chega de fora                                                                     | para uma visão geral; não é fonte de regra                          |
| [`plans/`](plans/)                                         | **histórico** dos planos 001–016 (antes do ADR 0010). Não é fonte de verdade, e nada novo entra aqui     | só para entender como algo chegou ao estado atual                   |
| [`../.claude/rules/`](../.claude/rules/)                   | regras técnicas por área, carregadas sozinhas ao tocar os arquivos da área                               | a IA lê automaticamente; humanos, ao revisar                        |
| [`../checks/`](../checks/)                                 | regras verificadas por máquina (`npm run check:rules`)                                                   | quando um check falhar                                              |
