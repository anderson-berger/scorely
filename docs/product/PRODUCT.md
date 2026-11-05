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

| Já existe                                     | Próximo                                      |
| --------------------------------------------- | -------------------------------------------- |
| login por código, perfil, notificações (sino) | módulo Grupos, começando pela E1 (plano 003) |

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
