# Produto

> Esqueleto do plano 002 (2026-11-05), redigido a partir do código e do PROJECT_CONTEXT. O que não se sabe está em "Perguntas abertas"; corrija à vontade. O `/task` consulta este arquivo para cortar escopo.

## Por que existe

| Projeto   | Para quê                                                                                |
| --------- | --------------------------------------------------------------------------------------- |
| `scorely` | gerenciar grupos esportivos recorrentes ("pelada"): quem joga, lista de presença, times |
| `base`    | template de referência para novos projetos do monorepo (não é produto; a confirmar: P8) |

## Público

A confirmar. Hoje: qualquer pessoa com email (login por código), sem papéis de plataforma.

## MVP (scorely)

| Já existe                                                | Próximo                                 |
| -------------------------------------------------------- | --------------------------------------- |
| login por código, perfil, notificações (sino), Grupos E1 | Grupos E2 (reservas e lista em camadas) |

## Módulo Grupos (scorely)

Resultado esperado: **"O jogo da semana acontece sem confusão de lista e com times equilibrados."** Caso de referência: vôlei misto de sexta (quantidade de homens e mulheres varia), rotação normal com levantador fixo.

| Termo     | Significado                                              |
| --------- | -------------------------------------------------------- |
| Dono      | quem criou o grupo                                       |
| Jogador   | qualquer participante                                    |
| Membro    | joga sempre; entra pelo link de membro                   |
| Reserva   | joga quando sobra vaga; entra pelo link de reserva       |
| Convidado | qualquer pessoa, quando a lista abre para todos          |
| Fila      | quem confirmou com a lista cheia; sobe se alguém desiste |
| Jogo      | a ocorrência semanal do grupo                            |

| #   | Entrega                                                                                                                                          | Estado                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| E1  | Grupo + link de membro + jogo da semana + confirmação + fila + cancelar jogo + remover membro                                                    | concluída ([plano 003](../plans/003-grupos-e1.md), [006](../plans/006-conflitos-transacao.md)) |
| E2  | Reservas + abertura da lista em camadas (membros → reservas → aberto), configurável                                                              | —                                                                                              |
| E3  | Divisão de times: manual, por nível, por nível + função; espalhar gênero; 1 levantador fixo por time                                             | —                                                                                              |
| E4  | Resultado por partida, com a escalação de cada partida                                                                                           | —                                                                                              |
| E5  | MVP configurável (desligado / votação / escolha do dono)                                                                                         | —                                                                                              |
| E6  | Ajuste automático de nível com rating de equipe (OpenSkill/Weng-Lin), só por resultados; MVP não entra no nível; o dono pode corrigir e congelar | —                                                                                              |

### Limites conhecidos (E1)

- Duas desistências ou remoções simultâneas de quem está dentro da lista podem notificar a mesma pessoa da fila e pular outra. A lista fica certa; só a notificação falha.

## Depois

- Página de notificações (hoje só o sino).
- Hospedagem do front, domínio, CI/CD, stages além de `dev`, SES com domínio verificado.

## Perguntas abertas

| #   | Pergunta                                                          |
| --- | ----------------------------------------------------------------- |
| P1  | Escopo e ordem do MVP do scorely além da E1                       |
| P2  | Multi-tenant (subdomínio por grupo/organização) ou app único?     |
| P3  | Usuários de plataforma (admin) separados dos usuários do produto? |
| P4  | Onde o front vai ser hospedado e com quais domínios?              |
| P5  | Quais stages (dev/stage/prod) e em quais contas AWS?              |
| P6  | Quando entra o CI/CD e qual o fluxo de branches?                  |
| P7  | Qual domínio vai ser verificado no SES?                           |
| P8  | O `base` continua só como template ou vira um produto?            |
