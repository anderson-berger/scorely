# 0021: módulo da api organizado por assunto, com dados e testes à parte

- Data: 2026-11-27
- Estado: aceita (o service e a forma das regras mudaram no [ADR 0025](0025-regras-como-funcoes.md))

## Contexto

Cada módulo da api é uma pasta plana. Em grupos são 25 arquivos no mesmo nível: regra, banco, repositório em memória e testes, com `matches/` e `competitions/` no meio. O `group.service.ts` tem 1.071 linhas com todos os assuntos juntos (o `match.service.ts`, 1.624), os testes têm nome de arquivos que não existem (`group.members.test.ts` sem `group.members.ts`) e cada arquivo de teste monta o próprio `setup()`. Os tipos que um módulo expõe a outro (`UserDirectory`, `MediaTarget`) moram no repositório ou no mapa do banco, então quem só precisa do tipo importa o banco do vizinho.

## Decisão

Todo módulo e submódulo da api segue a mesma forma:

```
<mod>/
  functions.ts            as rotas
  handlers.ts             os handlers; é quem monta as dependências (repositórios do DynamoDB)
  <mod>.service.ts        o service; com rules/, só junta os assuntos
  <mod>.access.ts         a porta para os outros módulos: tipos e funções que eles usam (só quando há)
  rules/                  um arquivo por assunto do doc do módulo (só quando há mais de um assunto)
    <assunto>.ts
  data/
    <mod>.table.ts        as chaves
    <mod>.repository.ts   o DynamoDB
    <mod>.memory.ts       a mesma interface, em memória
  tests/
    fixtures.ts           o setup único do módulo (pessoas, relógio, memória, service pronto)
    <assunto>.test.ts
    repository.contract.test.ts
  <sub>/                  submódulo (tem functions.ts), com a mesma forma por dentro
```

- **As únicas pastas de nome livre são os submódulos.** `rules/`, `data/` e `tests/` têm nome fixo, então quem abre `groups/` vê na hora o que é o grupo e o que é submódulo.
- **Assunto é arquivo, não pasta.** `rules/invites.ts`, não `invites/invites.service.ts`.
- **O prefixo é o nome da pasta do módulo** (`groups.repository.ts`, `matches.table.ts`).
- **Outro módulo de cima importa só a raiz** (`<mod>.service.ts`, `<mod>.access.ts`). O `data/` de outro módulo aparece só no `handlers.ts` e nos `tests/`. Dentro do mesmo módulo de cima (o grupo e os submódulos dele) o `data/` é livre: são a mesma partição ([ADR 0014](0014-itens-do-grupo-na-particao-do-grupo.md)).

Vale para todos os módulos do scorely de uma vez e para o `items` do `base`. Os testes de `src/lib/` também saem do lado do código, para `src/lib/tests/`. O web fica de fora.

## Por quê

- **O doc e o código têm a mesma forma.** Quem lê "Convites" no `grupos.md` acha `rules/invites.ts` e `tests/invites.test.ts`.
- **Nenhum arquivo de regra cresce sem limite.** O service do módulo só junta os assuntos; cada assunto cabe numa revisão.
- **Um setup de teste por módulo.** Pessoas, relógio e memória têm uma fonte só.
- **Regra, banco e teste não se misturam.** Quem revisa regra abre `rules/`; quem revisa banco abre `data/`; quem procura teste abre `tests/`.
- **A dependência entre módulos fica explícita.** O que um módulo oferece aos outros está no `access.ts`, não espalhado pelo repositório.

## Consequências

- Refatoração só de estrutura: nenhuma regra, rota, nome de função (lambda), chave do banco ou asserção de teste muda. O `handler` de cada função continua `src/modules/<mod>[/<sub>]/handlers.<nome>`.
- `UserDirectory`/`UserRecord` passam ao `users.access.ts` e `MediaTarget` ao `media.access.ts`.
- Exceção: `src/lib/db.ts` lê os nomes de entidade de `auth/data` e `users/data` (o `NOT_ENTITIES`, itens sem `updatedAt`/`version`, ADR 0013). Fica listado no check.
- O ADR 0020 (uma fonte por entidade no contrato, ainda em rascunho no worktree `outro-modulo`) é outra frente e vem depois; ele muda o conteúdo do `data/`, não a forma.
- Fica mais difícil: caminhos de import mais longos, e qualquer frente aberta nos arquivos da api tem conflito de merge (tudo muda de lugar).
- Regra: `.claude/rules/api.md` ("Forma do módulo"). Check: `checks/api.test.ts` (`*.test.ts` de módulo só em `tests/`; `*.table.ts`, `*.repository.ts`, `*.memory.ts` só em `data/` e com o prefixo do módulo; na raiz só os arquivos acima; `data/` de outro módulo de cima só no `handlers.ts` e nos `tests/`).
