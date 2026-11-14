# Produto

> Visão do produto e ordem das entregas. O `/task` consulta este arquivo para cortar escopo. As regras de cada módulo ficam em `docs/modules/`. O que não se sabe está em "Perguntas abertas".

## Por que existe

| Projeto   | Para quê                                                                                |
| --------- | --------------------------------------------------------------------------------------- |
| `scorely` | gerenciar grupos esportivos recorrentes ("pelada"): quem joga, lista de presença, times |
| `base`    | template de referência para novos projetos do monorepo (não é produto; a confirmar: P8) |

## Público

A confirmar. Hoje: qualquer pessoa com email (login por código), sem papéis de plataforma.

## MVP (scorely)

| Já existe                                                                                               | Próximo                                      |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| login por código, perfil com foto, notificações (sino), Grupos E1 e E2, Times (E3), cargos e permissões | Competição, etapa 1 (ativação e regulamento) |

O que cada módulo faz hoje, com as regras e o porquê, está em [`docs/modules/`](../modules/README.md). Este arquivo guarda só a visão e a ordem das entregas.

## Módulo Grupos (scorely)

Resultado esperado: **"O jogo da semana acontece sem confusão de lista e com times equilibrados."** Vocabulário, regras e limites: [grupos.md](../modules/grupos.md).

| #   | Entrega                                                                                                                                                                                                                                                                                                                               | Estado       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| E1  | Grupo + link de membro + jogo da semana + confirmação + fila + cancelar jogo + remover membro                                                                                                                                                                                                                                         | concluída    |
| E2  | Reservas + abertura da lista em camadas (membros → reservas → aberto), configurável                                                                                                                                                                                                                                                   | concluída    |
| E3  | Times ([times.md](../modules/times.md)): manual e sorteio num motor com regras obrigatórias do grupo (posição por time, times opostos) e preferência de gênero; avulsos; em 6 etapas (nível técnico fora por enquanto)                                                                                                                | concluída    |
| E4  | **Competição** ([competicao.md](../modules/competicao.md)), módulo à parte e **pago** (teste de 30 dias): regulamento do grupo (pontos de cada acontecimento, por partida ou pelo dia, desempate), fechar o jogo (chamada e resultado), partidas, ranking do grupo, temporadas e prêmios; em 6 etapas. Substitui as antigas E4a e E4b | em andamento |
| E5  | MVP configurável (desligado / votação / escolha do dono), dentro da competição                                                                                                                                                                                                                                                        | —            |
| E6  | Ajuste automático de nível com rating de equipe (OpenSkill/Weng-Lin), só por resultados; MVP não entra no nível; o dono pode corrigir e congelar                                                                                                                                                                                      | —            |

## Depois

- **Cargos criados pelo grupo:** além do Admin (GRP-50 em [grupos.md](../modules/grupos.md)), o dono cria cargos próprios (ex.: "Organizador", só times), se fizer falta.
- Resultado com placar e scout por fundamento (saque, bloqueio, ataque, erro), configurável por grupo, dentro da competição.
- Cobrança no app para o plano da competição (hoje liberado pela equipe, CMP-03).
- Página de notificações (hoje só o sino).
- Hospedagem do front, domínio, CI/CD, stages além de `dev`, SES com domínio verificado.

## Perguntas abertas

| #   | Pergunta                                                          |
| --- | ----------------------------------------------------------------- |
| P1  | Escopo e ordem do MVP do scorely além da E2                       |
| P2  | Multi-tenant (subdomínio por grupo/organização) ou app único?     |
| P3  | Usuários de plataforma (admin) separados dos usuários do produto? |
| P4  | Onde o front vai ser hospedado e com quais domínios?              |
| P5  | Quais stages (dev/stage/prod) e em quais contas AWS?              |
| P6  | Quando entra o CI/CD e qual o fluxo de branches?                  |
| P7  | Qual domínio vai ser verificado no SES?                           |
| P8  | O `base` continua só como template ou vira um produto?            |
