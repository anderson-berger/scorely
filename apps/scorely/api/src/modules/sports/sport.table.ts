// Como o esporte do catálogo é salvo e buscado (single-table, sem GSI). O formato é o `SportSchema` de
// @scorely/contracts, mais a `order` (ESP-06). Quem grava é só o `sports:sync` (ESP-01).

export const SPORT_ENTITY = 'Sport';

/** Entidade: `PK=SPORT#<sportId>`, `SK=META`. Leitura: GetItem; o catálogo inteiro, pelo lookup abaixo. */
export function sportKey(id: string) {
  return { PK: `SPORT#${id}`, SK: 'META' };
}

/**
 * Lookup de listagem do catálogo: `PK=LOOKUP#SPORT`, `SK=<sportId>`, `{ id }`. Gravado junto com o esporte.
 * Leitura: Query → BatchGet; a ordem de exibição é a `order` do item (ESP-06), não a do `SK`.
 */
export const SPORT_CATALOG_LOOKUP = 'LOOKUP#SPORT';

export function sportCatalogLookupKey(id: string) {
  return { PK: SPORT_CATALOG_LOOKUP, SK: id };
}
