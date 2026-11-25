# 0023: revisão visual por prints, fora do check

- Data: 2026-11-25
- Estado: aceita

## Contexto

O web ficou com cara de celular em qualquer tamanho e com botões grandes demais, e nada no fluxo pegou isso. O `npm run check` lê o código e não vê a tela. O revisor também só vê o diff.

## Decisão

Um script Playwright (`apps/scorely/web/screens/`) entra numa conta própria de dev, monta os dados que as telas precisam pela api, tira prints das rotas em 390, 768 e 1280px e mede o layout com limites fixos. A skill `/screens` roda o script, e o `/task` a chama no passo de revisão quando o diff mexe no web. O script fica fora do `npm run check`, porque precisa da api e do web rodando.

## Por quê

Ler o código acha erros de estrutura, mas não mostra se a tela ficou boa. Os prints e as medidas mostram, sem depender do dono abrir o navegador a cada mudança. A conta e os dados próprios deixam o resultado igual em toda rodada e não mexem nos dados do dono. Isso sobrevive à tabela recriada, que no dev acontece a cada mudança de modelo.

## Consequências

- O devcontainer instala as bibliotecas do Chromium, e o `postCreateCommand` baixa o navegador.
- Em dev, o mailer também grava o e-mail num arquivo, para o script ler o código de login.
- Os limites do script (altura de botão, área de toque, larguras) ficam em `screens/limits.ts` até virarem o guia visual (`.claude/rules/web-visual.md`, etapa 2).
- Comparar prints pixel a pixel fica para quando o visual estabilizar.
