// Como o Item é salvo e buscado (single-table, sem GSI). O formato da entidade é o `ItemSchema` de ./item.schema.
import type { Item } from './item.schema';

export const ITEM_ENTITY = 'Item';
export const LOOKUP_ENTITY = 'Lookup';

/**
 * Entidade: `PK=ITEM#<id>`, `SK=META`, com todos os atributos.
 * Leitura: GetItem.
 */
export function itemKey(id: Item['id']) {
  return { PK: `ITEM#${id}`, SK: 'META' };
}

/**
 * Lookup de listagem por data, do mais novo para o mais antigo: `PK=LOOKUP#ITEM`, `SK=<createdAt>#<id>`, `{ id }`.
 * Escrita: na mesma transação do Item.
 * Leitura: Query em `ITEM_LIST_LOOKUP_PK` → BatchGet em `itemKey(id)` (lotes de 100, mantendo a ordem).
 */
export const ITEM_LIST_LOOKUP_PK = 'LOOKUP#ITEM';

export function itemListLookupKey(item: Pick<Item, 'id' | 'createdAt'>) {
  return { PK: ITEM_LIST_LOOKUP_PK, SK: `${item.createdAt}#${item.id}` };
}
