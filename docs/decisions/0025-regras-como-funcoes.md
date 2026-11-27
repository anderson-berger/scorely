# 0025: regras como funções exportadas, sem fábrica de service

- Data: 2026-11-27
- Estado: aceita

## Contexto

Depois do [ADR 0021](0021-modulo-por-assunto.md), cada assunto de `rules/` é uma fábrica (`inviteRules(ctx)`) que devolve um objeto com as funções, e o `<mod>.service.ts` junta os objetos (`{ ...inviteRules(ctx), ...roleRules(ctx) }`). Para achar o que o handler chama é preciso abrir o service, depois a fábrica, e as funções internas e as públicas se misturam dentro dela. Cada regra também decide sozinha a hora (`deps.now?.() ?? new Date()`) e repete a tentativa por recursão.

## Decisão

- Toda regra é uma **`export async function` com as dependências no 1º argumento**: `createGroup(deps, userId, input)`. Sem fábrica que devolve objeto (`createXService`, `xRules(ctx)`) e sem service de repasse: o handler chama a regra direto (`import * as inviteRules from '.../rules/invites'`).
- O **`<Mod>Deps`** (a interface das dependências) fica no `<mod>.service.ts`. Módulo sem `rules/` tem as regras ali mesmo, como funções exportadas.
- **A hora atual vem de `deps.now()`**, obrigatório. Em produção, o `handlers.ts` passa o `systemNow` de `src/lib/clock.ts`, o único lugar com `new Date()` sem argumento.
- **Tentar de novo é loop** (`for (const _ of range(N))`), não recursão ([code.md](../../.claude/rules/code.md)).
- **Repositório grande se divide por assunto** dentro de `data/` (`<mod>.<assunto>.repository.ts`), e o `<mod>.repository.ts` junta todos no objeto que as regras recebem.

## Por quê

- **O handler leva direto à regra.** Quem lê `inviteRules.createInvite(deps, ...)` abre um arquivo e acha a função, sem passar pelo service nem pela fábrica.
- **O que é público fica marcado.** `export` é a regra que alguém chama; função sem `export` é detalhe do assunto.
- **Um relógio só.** A regra não escolhe a hora, então o teste fixa o relógio por um caminho só e nenhuma regra esquece o padrão.
- **Fácil para quem chega.** Loop e funções soltas se leem de cima para baixo; recursão e fábrica pedem acompanhar o fluxo de cabeça.

## Consequências

- Os repositórios continuam objetos (`dynamoGroupRepository`): são a porta que o teste troca pela memória.
- Os testes chamam a regra com as deps do `fixtures.ts` (`createGroup(t.deps, ...)`), não um service montado.
- Fica mais difícil: o `deps` aparece em toda chamada, e o nome da regra pode colidir com o do handler (por isso o `import * as`).
- Regra: `.claude/rules/api.md` ("Regras como funções") e `.claude/rules/code.md` (retry). Check: `checks/api.test.ts` (sem fábrica de service e sem `new Date()`/`Date.now()` fora do `lib/clock.ts`).
