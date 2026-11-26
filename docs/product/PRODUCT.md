# Produto

> Visão do produto e ordem das entregas. O `/task` consulta este arquivo para cortar escopo. As regras de cada módulo ficam em `docs/modules/`. O que não se sabe está em "Perguntas abertas".

## Por que existe

| Projeto   | Para quê                                                                                                                                                                   |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scorely` | unir quem joga e onde se joga: gerenciar grupos esportivos recorrentes ("pelada") e, depois, uma vitrine (mapa) de lugares, jogos abertos, times, campeonatos e escolinhas |
| `base`    | template de referência para novos projetos do monorepo (não é produto; a confirmar: P8)                                                                                    |

## Três áreas ([ADR 0024](../decisions/0024-tres-areas-e-navegacao.md))

| Área           | Para quem                      | Onde                                | Estado                     |
| -------------- | ------------------------------ | ----------------------------------- | -------------------------- |
| Vitrine        | qualquer pessoa, sem login     | `scorely.com` (mapa + lista)        | futura                     |
| Área logada    | o jogador: meus grupos, times… | `scorely.com`, mesmos endereços     | existe (grupos e partidas) |
| Área esportiva | a quadra, a escola (tenant)    | `tenant.scorely.com`, login próprio | futura                     |

Na vitrine, o **lugar** é a âncora do mapa. Nele aparecem os jogos abertos ("só chegar e jogar"), o "tenho horário, quero jogar", os times procurando adversário, os campeonatos, as promoções da quadra e o rei da quadra (ranking por lugar e esporte). O destaque pago (pino, topo da lista, Início) é previsto desde o começo, sempre marcado como patrocinado. Ordem sugerida: lugares → jogos abertos e "quero jogar" → desafios e campeonatos → rei da quadra → promoções e destaque pago.

## Público

A confirmar. Hoje: qualquer pessoa com email (login por código), sem papéis de plataforma.

## MVP (scorely)

| Já existe                                                                                                                                                                                                                                                                    | Próximo                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| login por código, perfil com foto, notificações (sino), grupo com logo e capa, convites, membros e reservas, grupo aberto com pedidos, cargos e passar o grupo, partida com confirmação pelo link, em ondas (PAR-01–19), repetição, times, resultado e histórico (PAR-20–39) | competição do grupo: temporada e ranking (COM-01–13, PAR-40) |

O que cada módulo faz hoje, com as regras e o porquê, está em [`docs/modules/`](../modules/README.md). Este arquivo guarda só a visão e a ordem das entregas.

## Módulo Grupos (scorely)

Resultado esperado: **"O jogo da semana acontece sem confusão de lista e com times equilibrados."** Vocabulário, regras e limites: [grupos.md](../modules/grupos.md).

> **Recomeço em 2026-11-21** ([ADR 0018](../decisions/0018-troca-do-grupo.md)): o primeiro grupo, os times e a competição saíram do ar. O grupo foi refeito sem jogo, e as entregas abaixo voltam sobre a agenda, na ordem de "Próximas etapas" em [grupos.md](../modules/grupos.md). Os docs de antes estão em [arquivo/](../modules/arquivo/).

| #   | Entrega                                                                                                                                                                                                                                                                                                                                               | Estado     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| E1  | Grupo + link de membro + jogo da semana + confirmação + fila + cancelar jogo + remover membro                                                                                                                                                                                                                                                         | fora do ar |
| E2  | Reservas + abertura da lista em camadas (membros → reservas → aberto), configurável                                                                                                                                                                                                                                                                   | fora do ar |
| E3  | Times ([arquivo/times.md](../modules/arquivo/times.md)): manual e sorteio num motor com regras obrigatórias do grupo (posição por time, times opostos) e preferência de gênero; avulsos; em 6 etapas (nível técnico fora por enquanto)                                                                                                                | fora do ar |
| E4  | **Competição** ([arquivo/competicao.md](../modules/arquivo/competicao.md)), módulo à parte e **pago** (teste de 30 dias): regulamento do grupo (pontos de cada acontecimento, por partida ou pelo dia, desempate), fechar o jogo (chamada e resultado), partidas, ranking do grupo, temporadas e prêmios; em 6 etapas. Substitui as antigas E4a e E4b | fora do ar |
| E5  | MVP configurável (desligado / votação / escolha do dono), dentro da competição                                                                                                                                                                                                                                                                        | —          |
| E6  | Ajuste automático de nível com rating de equipe (OpenSkill/Weng-Lin), só por resultados; MVP não entra no nível; o dono pode corrigir e congelar                                                                                                                                                                                                      | —          |

## Depois

- Resultado com placar e scout por fundamento (saque, bloqueio, ataque, erro), configurável por grupo, dentro da competição.
- Cobrança no app para o plano da competição (quando a competição voltar).
- Página de notificações (hoje só o sino).
- Hospedagem do front, domínio, CI/CD, stages além de `dev`, SES com domínio verificado.

## Perguntas abertas

| #   | Pergunta                                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Escopo e ordem do MVP do scorely além da E2                                                                                              |
| P2  | ~~Multi-tenant ou app único?~~ Respondida em 2026-11-26 (ADR 0024): app único para jogadores; `tenant.scorely.com` para a área esportiva |
| P3  | Usuários de plataforma (admin) separados dos usuários do produto?                                                                        |
| P4  | Onde o front vai ser hospedado e com quais domínios?                                                                                     |
| P5  | Quais stages (dev/stage/prod) e em quais contas AWS?                                                                                     |
| P6  | Quando entra o CI/CD e qual o fluxo de branches?                                                                                         |
| P7  | Qual domínio vai ser verificado no SES?                                                                                                  |
| P8  | O `base` continua só como template ou vira um produto?                                                                                   |
