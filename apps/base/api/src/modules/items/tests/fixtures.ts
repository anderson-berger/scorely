import { memoryItems } from '@base/api/src/modules/items/data/items.memory';
import { createItemService } from '@base/api/src/modules/items/items.service';

// O setup único dos itens (ADR 0021): o service com o repositório em memória e, se dado, o relógio.

export function setup(now?: () => Date) {
  return createItemService(memoryItems(), now);
}
