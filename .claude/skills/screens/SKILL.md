---
name: screens
description: Tira prints das telas do web scorely em 390, 768 e 1280px, mede o layout e resume os problemas (ADR 0023). Use para ver como as telas estão, conferir uma mudança no web, ou quando o /task pedir na revisão. Aceita rotas e larguras como argumento.
---

# /screens [rotas] [larguras]

O script está em `apps/scorely/web/screens/` ([ADR 0023](../../../docs/decisions/0023-revisao-visual-por-prints.md)). Ele entra sozinho com a conta `screens@scorely.dev`, monta o grupo e a partida pela api e grava tudo em `.claude/work/screens/` (fora do git). Não usa os dados do dono.

## Argumentos

- **Rotas:** os `id` de `screens/routes.ts` (`login`, `grupos`, `criar-grupo`, `grupo`, `partidas`, `partida`, `nova-partida`, `membros`, `configuracoes`, `perfil`). Sem rota, todas.
- **Larguras:** `390`, `768`, `1280`. Sem largura, as três.

`/screens partidas 390` vira `SCREENS_ROUTES=partidas SCREENS_WIDTHS=390`. Mais de um valor vai separado por vírgula.

## Passos

1. Confira se a api e o web respondem: `curl -s -o /dev/null -w '%{http_code}' http://localhost:3010/health` e o mesmo em `http://localhost:5174/`. Se um não responder, **peça ao dono** para rodar `npm run dev:scorely` e pare. Não suba os servidores.
2. Rode `npm run screens:scorely` na raiz, com as variáveis dos argumentos. O relatório é reescrito a cada rodada, só com o recorte pedido.
3. Leia `.claude/work/screens/report.md`.
4. Abra com o `Read` os PNGs que importam: as rotas pedidas ou tocadas pela tarefa e as que têm violação. As medidas não pegam tudo: procure também texto cortado ou sobreposto, chave de tradução à mostra e espaço desperdiçado.
5. Responda com a tabela do relatório, os problemas agrupados por causa (não repita linha a linha) e o que você viu nos prints que as medidas não pegaram.

## Se der errado

- `Executable doesn't exist`: falta o navegador, `npx playwright install chromium`.
- `No new login code`: a api não está no serverless offline deste container, ou o limite de códigos estourou (AUTH-02).
- Erro numa rota (`erro` na tabela): a tela não abriu, e o motivo está no relatório. Se o botão que abre um painel mudou de texto, ajuste `screens/routes.ts`.

## Não faça

- Não mude os limites de `screens/limits.ts` para uma violação sumir. Eles são do dono.
- Violação não é falha do script: o relatório é o resultado. Corrija só o que a tarefa pede.
