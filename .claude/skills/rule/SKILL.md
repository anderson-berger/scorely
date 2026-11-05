---
name: rule
description: Grava uma correção do dono como regra no lugar certo — check automático, ADR ou regra de área. Use com /rule <correção>, ou ofereça quando o dono corrigir algo.
---

# /rule <correção>

Classifique a correção na ordem abaixo e grave. Uma correção pode gerar 1 + 2 (check + motivo).

## 1. Dá para verificar por máquina? (preferência máxima)

- Se existir uma regra pronta do Biome, ative em `biome.json`. Senão, escreva um check em `checks/<área>.test.ts` no padrão dos existentes: função pura que devolve as violações, um teste no código real (lista vazia) e um teste com a violação plantada (lista não vazia).
- Acrescente uma linha na regra de área (`.claude/rules/<área>.md`) apontando para o check.
- Prova: `npm run check:rules`. O teste plantado falha a regra; o código atual passa. **Se o código atual violar**, liste as violações (`arquivo:linha`) e não corrija sozinho: pergunte ao dono.

## 2. Tem motivo ou trade-off ("fizemos X porque Y")?

- Crie `docs/decisions/NNNN-slug.md` a partir de `docs/decisions/_template.md` e acrescente a linha no índice `docs/decisions/README.md`. Se a correção traz o motivo de um ADR existente com "motivo: a confirmar", atualize esse ADR.

## 3. Senão, é convenção

- Grave na regra de área certa (`.claude/rules/<área>.md`). Área nova: crie o arquivo com `paths:` (frontmatter YAML, globs entre aspas) e acrescente na tabela do `CLAUDE.md`. Regra global: `CLAUDE.md` (que deve continuar ≤ 50 linhas).

## Antes de gravar

Procure duplicata (`grep` nas regras, nos checks e nos ADRs). Se já existe, ajuste a existente em vez de criar outra. Regra de área acima de ~60 linhas → proponha dividir a área.

## Saída

Uma linha: "Classifiquei como <check | decisão | convenção>, gravei em <arquivo(s)>." Mais o resultado do `npm run check:rules` quando houver check.
