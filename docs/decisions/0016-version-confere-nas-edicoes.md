# 0016: Edição manda a `version`; disputa por lugar usa contador

- Data: 2026-11-15
- Estado: aceita

## Contexto

Toda entidade tem `version` ([0013](0013-version-e-updatedat.md)), mas a escrita não a confere. Duas pessoas editando o mesmo item ao mesmo tempo: a segunda apaga a mudança da primeira sem ninguém perceber. Isso fica mais provável com cargos (vários admins) e com os padrões em vários níveis.

## Decisão

- **Edição** (PUT/PATCH de algo que a tela mostrou):
  - O pedido manda `version`, a do item que está sendo editado: `SETTINGS` nos Ajustes, `SCHEDULE#` num horário, o jogo num jogo.
  - O banco só grava com `version = :expected` e soma 1.
  - Versão diferente responde `VERSION_CONFLICT` (409, `details.currentVersion`). A tela recarrega e a pessoa refaz.
- **Ação que disputa um lugar** (entrar no grupo, confirmar no jogo): sem `version`. Um contador com condição no banco garante o limite (`ADD count 1` com `count < max`).
- **Criar e apagar:** a criação não manda `version`. Apagar algo que a tela mostrou, como um horário ou um lugar, manda.

## Por quê

- **A `version` protege um item contra a escrita perdida.**
- **Ela não protege um limite.** Duas entradas gravam itens diferentes (`MEMBER#a`, `MEMBER#b`), sem uma version em comum para conferir.
- **Quem entra pelo link não tem version para mandar.** Travar pela version do grupo faria cada entrada conflitar com quem está editando os Ajustes.
- **O contador** resolve o limite numa escrita só, sem reler a lista.

## Consequências

- Os inputs de edição ganham `version` (obrigatória) nos contratos.
- `VERSION_CONFLICT` entra no catálogo de erros e na tradução, e o web trata o conflito recarregando o item.
- O helper de alteração do `db.ts` ganha a condição da version esperada.
- Regra: `.claude/rules/dynamodb.md` e `.claude/rules/api.md`.
