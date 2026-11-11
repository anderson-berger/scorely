# 011 — Agente modelador de dados e mapa do banco

## Objetivo

Os erros caros num single-table sem GSI nascem na modelagem: um padrão de acesso que ninguém previu, uma chave que muda e deixa itens antigos para trás, uma transação que cresce até passar do limite. Este plano cria três coisas:

1. **`data-modeler`**: um subagente só de leitura, chamado no passo 1 do `/task` quando o plano mexe no banco. Ele devolve a seção `## Modelo de dados` num formato fixo.
2. **`docs/data-model.md`**: o mapa único de todas as chaves (`PK`/`SK`) de cada projeto.
3. **Um check**: falha se um `*.table.ts` montar uma `PK` que não está no mapa, ou se o mapa tiver uma `PK` que nenhum código monta.

## Fora de escopo

- Um agente que escreve código de banco. A implementação continua no fluxo normal.
- Mudar alguma chave ou item que já existe. O mapa só descreve o que existe hoje.
- Conferir `SK` pelo check (ver D3 e P1).
- Rodar o agente fora do `/task` de forma automática, por hook.
- Ferramenta de migração de dados. O agente só aponta quando uma migração é necessária.

## Decisões

- **D1. Agente consultor, só leitura.** Ferramentas: `Read`, `Glob`, `Grep`. Não pode alterar o plano. Quem cola a saída dele no plano é o agente principal. Motivo: dar um olhar independente na hora em que mudar ainda é barato, sem dividir a implementação em duas mãos.
- **D2. Quando chamar.** Sempre que o plano criar, alterar ou remover um item, uma chave, um lookup ou uma transação, ou criar uma leitura nova (padrão de acesso). Na dúvida, chama. Se o plano não toca no banco, a seção vira `## Modelo de dados` com uma linha só: "não toca no banco: <motivo>". Assim o reviewer consegue cobrar a seção.
- **D3. O check confere só a `PK`.** A `PK` é extraída dos literais de string ou template dos `*.table.ts`, sem os comentários, quando começa com `MAIÚSCULAS#` (ex.: `` `LOOKUP#GAME#${gameId}#ATTENDANCE` ``). A `SK` muitas vezes vem de outra função ou de um campo (`${a.confirmedAt}#${a.userId}`), e casar cada `SK` com a sua `PK` exigiria interpretar o código. A `SK` fica documentada no mapa, e quem a cobra é o agente e o reviewer.
- **D4. Placeholders são equivalentes.** Tanto `${qualquerCoisa}` no código quanto `<qualquer>` no mapa viram `<>` na comparação. Então `GROUP#${id}` bate com `GROUP#<groupId>`. A `PK` fixa (`LOOKUP#ITEM`) é comparada literalmente.
- **D5. Comparação nas duas direções e por projeto.** Uma `PK` no código sem linha no mapa falha, e uma linha do mapa sem `PK` no código também falha (mapa desatualizado). Cada projeto com api (`projects()`) tem a sua seção `## <projeto>` no mapa, e as seções não se misturam.
- **D6. O check fica em `checks/dynamodb.test.ts`.** É a área de DynamoDB, e a regra `dynamodb.md` já aponta para esse arquivo. Vai junto um check de que o `data-modeler` só tem `Read`/`Glob`/`Grep` no frontmatter.
- **D7. Quem atualiza o mapa.** O agente propõe as linhas do mapa na saída dele, e o agente principal grava no passo 4, junto com o `*.table.ts`. O check garante que os dois andam juntos.
- **D8. O reviewer cobra a seção.** Item novo no checklist: se o diff toca `*.table.ts` ou `*.repository.ts`, o plano tem que ter a `## Modelo de dados` vinda do `data-modeler`, e a implementação tem que seguir essa seção (chaves, transações, condições).

## Contrato

Não há rota, schema Zod nem erro novo. O contrato aqui são dois formatos.

**Mapa (`docs/data-model.md`):** uma seção `## <projeto>` com uma tabela. O check lê só a primeira coluna, que é a `PK` entre crases.

```
## scorely

| PK                            | SK     | entity | O que é               | Escrita                          | Leitura                     | Onde                  |
| ----------------------------- | ------ | ------ | --------------------- | -------------------------------- | --------------------------- | --------------------- |
| `USER#<id>`                   | `META` | User   | usuário               | transação com o lookup de email  | GetItem                     | users/user.table.ts   |
| `LOOKUP#USER#EMAIL#<email>`   | `META` | Lookup | email único → `{ id }`| `attribute_not_exists(PK)`       | GetItem → GetItem no User   | users/user.table.ts   |
```

**Saída do `data-modeler`** (formato fixo, ≤ 60 linhas):

```
## Modelo de dados

**Veredito:** ok | precisa de decisão do dono

### Padrões de acesso
| # | Caso do plano | Operação | Chave | Leitura consistente? |

### Itens
| PK | SK | entity | Atributos | ttl/expiresAt | novo / alterado / removido |

### Transações
| Operação | Itens no pior caso (limite 100) | Condições | Falha → código do catálogo |

### Itens que já existem
- <migração necessária e como fazer> | "nenhum: <por quê>"

### Riscos
- <partição quente, item que cresce (400 KB), paginação, corrida, lookup órfão>

### Mapa
- <linhas para acrescentar, alterar ou remover em docs/data-model.md>

### Perguntas
- <só as que bloqueiam; vão para "Perguntas que bloqueiam" do plano>
```

## Casos de comportamento

1. **Dado** um `*.table.ts` com `` `GROUP#${id}` `` e o mapa do projeto com `` `GROUP#<groupId>` ``, **quando** o check roda, **então** não há violação.
2. **Dado** um `*.table.ts` com `` `LOOKUP#FOO#${x}` `` que não está no mapa, **quando** o check roda, **então** falha com `<arquivo>: PK LOOKUP#FOO#<> fora do docs/data-model.md`.
3. **Dado** o mapa com `` `OLD#<id>` `` que nenhum `*.table.ts` monta, **quando** o check roda, **então** falha com `docs/data-model.md (<projeto>): PK OLD#<> sem código`.
4. **Dado** uma `PK` fixa `'LOOKUP#ITEM'` em string comum, **quando** ela está no mapa, **então** passa; e **quando** não está, **então** falha.
5. **Dado** um comentário no `*.table.ts` com `` `LOOKUP#X#<id>` `` (JSDoc ou `//`), **quando** o check roda, **então** ele não conta como chave.
6. **Dado** um literal que não começa com `MAIÚSCULAS#` (`'META'`, `` `${a}#${b}` ``), **quando** o check roda, **então** ele não conta como `PK`.
7. **Dado** uma `PK` do `base` que só aparece na seção `## scorely`, **quando** o check roda, **então** falha nas duas direções (as seções não se misturam).
8. **Dado** o repositório real depois deste plano, **quando** o `npm run check` roda, **então** passa, com todas as `PK` atuais de `base` e `scorely` no mapa.
9. **Dado** o `.claude/agents/data-modeler.md`, **quando** o check lê o frontmatter, **então** as ferramentas são só `Read`, `Glob` e `Grep`. **Dado** um frontmatter plantado com `Write`, **então** falha.
10. **Manual:** **dado** um pedido de `/task` que cria um lookup novo, **quando** o passo 1 roda, **então** o `data-modeler` é chamado com o caminho do plano e o plano ganha a `## Modelo de dados` no formato fixo. **Dado** um pedido só de tela, **então** a seção diz "não toca no banco".

## Tarefas

1. **Mapa** `docs/data-model.md` com todas as `PK` atuais. São 1 no base e 19 no scorely, tiradas dos `*.table.ts`, com a SK, o entity, a escrita e a leitura de cada uma. Também a linha no `docs/README.md`. _Pronto quando:_ o caso 8 passa. _Risco:_ esquecer uma chave, mas o check pega.
2. **Check** em `checks/dynamodb.test.ts`: extrair as `PK` (sem comentários), ler as seções do mapa, normalizar os placeholders, comparar nas duas direções e conferir o frontmatter do agente, com as violações plantadas. _Pronto quando:_ os casos 1–9 passam. _Risco:_ o regex pegar um literal que não é chave; os casos 5 e 6 cobrem isso.
3. **Agente** `.claude/agents/data-modeler.md`: entrada (o caminho do plano), o que ler (o plano, o mapa, `dynamodb.md`, as ADRs 0002/0004/0006, os `*.table.ts` e `*.repository.ts` do módulo, `lib/db.ts`), o checklist de modelagem (todo padrão de acesso tem chave, lookup só com `{ id }`, entidade e lookups na mesma transação, contagem de itens no pior caso, unicidade por `attribute_not_exists`, itens antigos quando a chave ou o formato mudam, partição quente, item que cresce, `ttl` + `expiresAt`) e o formato de saída. _Pronto quando:_ o caso 9 passa. _Risco:_ uma saída longa demais; o limite de 60 linhas está no próprio agente.
4. **Fluxo:** o passo 1 do `.claude/skills/task/SKILL.md` ganha a chamada ao agente (D2) e a seção `Modelo de dados` na lista do plano. Entram também o item no checklist do `reviewer` (D8), a regra em `dynamodb.md` ("chave nova → linha no mapa") e a linha do fluxo no `CLAUDE.md`. _Pronto quando:_ os textos estão consistentes entre si. _Risco:_ baixo.
5. **Roteiro manual** do caso 10, para o dono rodar.

## Perguntas que bloqueiam

- **P1. O check confere só a `PK`?** Recomendo que sim (D3). Conferir o par `PK`/`SK` exige casar funções separadas (ex.: `groupMembersLookupPk` + `groupMemberLookupKey`), e o ganho é pequeno, porque o agente e o reviewer já olham a `SK`.
- **P2. O `base` entra no mapa?** Recomendo que sim: é uma linha só, e o check vale igual para todo projeto com api. A alternativa é pular o `base`, mas aí o template ensina um fluxo que o check não cobra.
- **P3. Você quer poder chamar o `data-modeler` direto, fora do `/task`?** Por exemplo, numa pergunta de design do tipo "tem como...?", passando a pergunta no lugar do plano, com a mesma saída. Recomendo que sim, porque ele não escreve nada, então não tem risco.

## Status

- [ ] 1. Plano — aguardando aprovação
- [ ] 2. Contrato
- [ ] 3. Testes
- [ ] 4. Implementação
- [ ] 5. Revisão
- [ ] 6. Entrega
