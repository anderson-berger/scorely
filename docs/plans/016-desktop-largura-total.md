# 016 — Desktop na largura toda, sem coluna centralizada

Pedido do dono (2026-11-10): no desktop, **todas** as telas centralizam o conteúdo numa coluna (480px, 960px, 1080px ou 1200px) e deixam margens enormes à esquerda e à direita. Print da tela de Grupos a 1840px: o card e o "Novo grupo" no meio, com mais de 350px vazios de cada lado. O dono aprovou a proposta (conteúdo na área toda ao lado do menu; formulários limitados e alinhados à esquerda).

## Objetivo

A partir de 1024px, o conteúdo ocupa a área toda ao lado do menu, alinhado à esquerda, com margens fixas. As grades se distribuem em quantas colunas couberem. No celular nada muda.

## Fora de escopo

- Login, estado vazio da tela de Grupos, painel que sobe de baixo (`BottomSheet`) e telas de carregamento ou erro: continuam centralizados, porque ali o conteúdo é uma peça só.
- Mudança de conteúdo das telas.

## Decisões

| #   | Decisão                                                                                                                                                                                                                                                                                    | Por quê                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| D1  | **`.sc-page` fluida no desktop**: abaixo de 1024px, como hoje (até 480px, centralizada, 16px de margem). A partir de 1024px, sem `max-width`, `margin: 0` e padding de 24px em cima e 32px dos lados. Saem `.sc-page--wide` (plano 014, D7) e `.sc-page--group` (plano 015, D17).          | um lugar só decide a largura; o pedido do dono              |
| D2  | **`.sc-page--form`** para Perfil e Criar grupo: a partir de 1024px, `max-width: 704px` (640px de conteúdo + 64px de padding), alinhada à esquerda.                                                                                                                                         | campo de formulário com 1700px fica ruim de ler e preencher |
| D3  | **Grades fluidas**: cards da tela de Grupos com `repeat(auto-fill, minmax(300px, 1fr))` (já é assim); vagas da Escalação com `repeat(auto-fill, minmax(220px, 1fr))`; membros com `repeat(auto-fill, minmax(280px, 1fr))`; seções dos Ajustes com `repeat(auto-fill, minmax(420px, 1fr))`. | o número de colunas acompanha a tela                        |
| D4  | **Jogo cancelado no desktop**: a faixa fica alinhada à esquerda com até 640px, em vez de 480px centralizados.                                                                                                                                                                              | segue a regra de alinhar à esquerda                         |
| D5  | **Sem teste automático**: a mudança é só de CSS, sem regra pura para testar. Fica o roteiro manual.                                                                                                                                                                                        | o padrão do repo testa regra, não layout                    |

## Contrato

**Sem mudança.**

## Casos de comportamento

Sem casos automatizados (D5). Roteiro manual a 390px, 1024px e 1840px:

- Tela de Grupos: título e "Novo grupo" nas pontas da área de conteúdo; cards em 4–5 colunas a 1840px.
- Página do grupo: capa e abas na largura toda; aba Jogo em duas colunas largas; vagas em 3 ou mais colunas.
- Membros: pessoas em 3 ou mais colunas. Ajustes: seções lado a lado.
- Perfil e Criar grupo: formulário alinhado à esquerda, com até 640px.
- Jogo cancelado: faixa à esquerda, com até 640px.
- Celular (390px): tudo igual a antes.
- Login, estado vazio de Grupos e painéis de baixo: continuam centralizados.

## Tarefas

| #   | Tarefa                                                                                         | Pronto quando     | Risco |
| --- | ---------------------------------------------------------------------------------------------- | ----------------- | ----- |
| 1   | `app.scss`: `.sc-page` fluida no desktop, `.sc-page--form`, saem `--wide` e `--group` (D1, D2) | roteiro das telas | baixo |
| 2   | Grades fluidas e jogo cancelado (D3, D4)                                                       | roteiro do grupo  | baixo |
| 3   | `npm run check`                                                                                | check verde       | baixo |

## Perguntas

Nenhuma: o dono aprovou a proposta (2026-11-10).

## Status

| Passo            | Estado                                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1. Plano         | ✅ aprovado (2026-11-10): largura toda no desktop, formulários até 640px à esquerda                                         |
| 2. Contrato      | ✅ sem mudança                                                                                                              |
| 3. Testes        | ✅ sem teste automático (D5): só CSS                                                                                        |
| 4. Implementação | ✅ tarefas 1–3; web 262, api 253, base 12, rules 56, lint verde; `vite build` ok                                            |
| 5. Revisão       | ✅ `reviewer`: aprovado com ressalvas, sem ❌ (`016-desktop-largura-total.review.md`); comentário e sobra de CSS corrigidos |
| 6. Entrega       | ✅ tudo staged; commit com o dono                                                                                           |
