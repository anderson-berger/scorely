# 0022: partidas e competição como submódulos do grupo

- Data: 2026-11-25
- Estado: aceita

## Contexto

Partidas e competição só existem dentro de um grupo: as rotas são `/groups/{publicId}/...`, as chaves moram na partição do grupo ([ADR 0014](0014-itens-do-grupo-na-particao-do-grupo.md)), o acesso passa pelo `group.access.ts` e as telas abrem dentro do casco do grupo (`groups/routes.ts` já junta as rotas das duas). Mesmo assim, as pastas ficam lado a lado com `groups/` em `modules/`, como se fossem módulos independentes.

## Decisão

`matches/` e `competitions/` passam a ser **submódulos** de `groups/`, na api e no web:

```
api/src/modules/groups/
  functions.ts, handlers.ts, group.*.ts    (o grupo, sem mudança)
  matches/                                 (o que era modules/matches, igual por dentro)
  competitions/                            (o que era modules/competitions, igual por dentro)
web/src/modules/groups/
  pages/, components/, ...                 (o grupo)
  matches/                                 (pages/, components/, routes.ts, ...)
  competitions/
```

**Submódulo é a subpasta de um módulo que tem o próprio `functions.ts`.** Ele continua tendo doc próprio (`partidas.md`/`PAR`, `competicao.md`/`COM`), rotas, handlers, service e repositório próprios. Só a pasta muda; nenhum nome de arquivo, rota, função (lambda) ou regra muda.

## Por quê

- **A pasta mostra a dependência real.** Quem abre `groups/` vê tudo o que vive no grupo, e um módulo de nível de cima (`users`, `auth`, `media`) nunca depende de partida.
- **O doc continua um por assunto.** Partidas e competição têm regras demais para virar seção do `grupos.md`; o submódulo mantém o doc e o prefixo.
- **motivo de ser agora: a confirmar pelo dono.**

## Consequências

- `serverless.ts` importa `groups/matches/functions` e `groups/competitions/functions`; o `handler` de cada função aponta para `src/modules/groups/<sub>/handlers.<nome>`. O nome das funções não muda, então o deploy só troca o código.
- Os imports passam a `@scorely/api/src/modules/groups/matches/...` (e o mesmo no web). Nenhum import relativo (`code.md`).
- Índice dos docs: a linha vira `scorely/groups/matches` e `scorely/groups/competitions`. O check `checks/modules.test.ts` desce nas subpastas de cada módulo e trata como submódulo toda subpasta com `functions.ts`: ela precisa estar no índice como `projeto/modulo/submodulo`.
- Regras: `.claude/rules/api.md` e `.claude/rules/web.md` ("Módulo novo") ganham o caso do submódulo. Os `paths` das regras já são recursivos (`apps/*/api/src/**`, `apps/*/web/**`).
- Fica mais difícil: o caminho dos imports fica mais longo, e outra frente que mexa nos arquivos de partidas ou de grupos ao mesmo tempo vai ter conflito de merge (move de arquivo).
