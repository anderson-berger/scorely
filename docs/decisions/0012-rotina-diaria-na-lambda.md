# 0012: rotina diária como gatilho de lambda, sem recurso de infra

- Data: 2026-11-14
- Estado: aceita; sem uso desde [0018](0018-troca-do-grupo.md) (a competição saiu do ar); volta a ter uso com a rotina `matchesAgenda` (2026-11-23, PAR-21, 24 em partidas.md)

## Contexto

A temporada da competição termina pela data (CMP-32, 39). Se a trava depende de alguém abrir o app, quem não abre não recebe o aviso de fim nem o troféu na hora. O projeto não tem fila nem agendador, e a [ADR 0001](0001-infra-separada-da-api.md) não deixa a api declarar recurso de infra.

## Decisão

Tarefas periódicas são uma função da api com o evento `schedule` (EventBridge), declarado no `functions.ts` do módulo, como as rotas. Nenhum recurso de infra novo. A tarefa também tem um caminho de reserva no fluxo normal (a primeira leitura depois do prazo), então ela só adianta o que aconteceria de qualquer jeito.

## Por quê

O evento `schedule` é o gatilho de uma lambda, como o `httpApi`. Ele nasce e morre com a função e não guarda estado, então não é um recurso que outro serviço precise ler (o que a ADR 0001 separa). Ter a reserva no fluxo normal faz a tarefa ser idempotente e o dev local (que não tem agendador) continuar funcionando.

## Consequências

- Fica fácil: avisar no fim do prazo sem depender de acesso, sem fila nem cron externo.
- Fica mais difícil: a tarefa não pode fazer Scan (ADR 0002), então precisa de um lookup próprio do que está pendente (ex.: `LOOKUP#SEASON#OPEN`).
- No dev local, a tarefa roda só à mão (`npx sls invoke local -f <função>`, a partir da raiz).
- Onde vivia: a rotina `competitionLockSeasons`, no `functions.ts` do módulo de competição, que saiu do ar com a [0018](0018-troca-do-grupo.md) (a regra está em [arquivo/competicao.md](../modules/arquivo/competicao.md), CMP-39). Hoje nenhuma função usa o evento `schedule`.
