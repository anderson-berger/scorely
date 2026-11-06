# 0006: datas em UTC; exibição no fuso do perfil; recorrência em hora local + fuso do grupo

- Data: 2026-11-05 (plano 005)
- Estado: aceita

## Contexto

O scorely mostra datas (notificações, jogos) para usuários que podem estar em fusos diferentes, e os jogos se repetem toda semana no mesmo horário local, inclusive em lugares com horário de verão.

## Decisão

- Back e contracts guardam e trafegam instantes sempre em UTC (ISO 8601, `...Z`).
- A web mostra todo instante no fuso do perfil (`user.timeZone`; sem ele, o fuso detectado), por um helper único (`web/src/lib/datetime.ts`).
- A recorrência de um grupo é guardada como hora local + fuso do grupo (IANA), nunca como um instante UTC fixo. O fuso padrão do grupo é o do dono.

## Por quê

Decisão do dono (plano 005). Um instante UTC fixo deslocaria a hora local do jogo na troca do horário de verão; e um helper único impede datas formatadas com idioma ou fuso fixos (como era o sino).

## Consequências

- Fuso: o back valida (`TimeZoneSchema`) só ao gravar; quem lê (`User.timeZone`, `Group.timeZone`) aceita o texto. Se o navegador não conhece o fuso, `formatDateTime` usa o detectado (plano 003, D13/D14).
- Cálculo de ocorrência precisa de conversão hora local + fuso → UTC (`api/src/lib/zoned.ts`, plano 003).
- Regra: `.claude/rules/web.md`. Check: `checks/web.test.ts` (nenhum `toLocale*String`/`Intl.DateTimeFormat` na web do scorely fora do helper).
