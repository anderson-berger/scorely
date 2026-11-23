# 0018: Troca do grupo, com times, competição e esportes fora do ar

- Data: 2026-11-21
- Estado: aceita

## Contexto

A [ADR 0017](0017-grupo-v2-lado-a-lado.md) pôs o grupo novo ao lado do antigo, com nomes provisórios (`V2`, `GROUP2`, `/v2`), e deixou a troca para quando o novo cobrisse o que se usa. O novo já tem criar, ver, logo e capa, convites, membros e reservas, e a próxima etapa (grupo aberto e pedidos) criaria mais nomes provisórios. Os times e a competição dependem do jogo do grupo antigo, que o grupo novo não tem. Não há dados em produção.

## Decisão

- **A troca acontece agora,** antes da etapa C do grupo, e não quando a agenda existir.
- **Saem do ar, inteiros (api, web, contratos, rotas, erros, avisos, i18n):** o grupo antigo (`GRP`), os times (`TIM`), a competição (`CMP`), os esportes (`ESP`) e os lugares (`places`, só do grupo antigo). Sai também o que só eles usavam: `lib/zoned.ts` (horários do grupo), o `sports:sync` e a rotina diária da competição ([ADR 0012](0012-rotina-diaria-na-lambda.md)).
- **Os docs deles vão para `docs/modules/arquivo/`,** com um aviso de fora do ar. Ficam para consulta quando times e competição forem refeitos sobre a agenda. Os prefixos `GRP`, `TIM`, `CMP` e `ESP` não voltam a ser usados.
- **O grupo novo perde os nomes provisórios:** `groups-v2` vira `groups` (api, web, contracts), o doc `grupos-v2.md` vira `grupos.md`, os schemas e componentes perdem o `V2`, as chaves perdem o `2` (`GROUP#<id>`, `LOOKUP#GROUP#PUBLIC#<code>`, `LOOKUP#USER#<id>#GROUP`, ...), e as rotas da api e da web perdem o `/v2`. As regras continuam `GRV` (ADR 0010: o número não muda de prefixo).
- **A tabela é recriada** (sem dados em produção, sem script de migração).

## Por quê

Cada etapa do grupo feita antes da troca aumenta o que precisa ser renomeado depois. Os times e a competição não funcionam com o grupo novo: mantê-los no ar só deixa dois grupos no app e código que ninguém usa. Refazer os dois sobre a agenda já estava decidido (ADR 0017), e o git e o arquivo guardam o que existia.

## Consequências

- O app passa a ter um grupo só, sem jogo, times nem competição até a agenda.
- O perfil perde a sala de troféus, e o fuso do perfil deixa de ser o padrão do grupo (o grupo não tem fuso).
- As peças da web do grupo antigo que o novo usa (a cor do grupo, as iniciais, a linha de configuração, `isVersionConflict`) mudam de lugar antes de o módulo sair.
- A [ADR 0017](0017-grupo-v2-lado-a-lado.md) fica concluída por esta. A [0012](0012-rotina-diaria-na-lambda.md) fica sem uso até a competição voltar. A [0015](0015-modelo-do-grupo-e-do-jogo.md) deixa de valer para o grupo e o esporte; o modelo do jogo volta a ser discutido com a agenda. A [0014](0014-itens-do-grupo-na-particao-do-grupo.md) continua valendo (o grupo novo já segue).
