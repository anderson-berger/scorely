import { created, HttpError, type HttpEvent, parseBody, route } from '@base/api/src/lib/http';
import { dynamoItemRepository } from '@base/api/src/modules/items/data/items.repository';
import {
  type CreateItemInput,
  CreateItemInputSchema,
  type Item,
} from '@base/api/src/modules/items/item.schema';
import { createItemService } from '@base/api/src/modules/items/items.service';

const service = createItemService(dynamoItemRepository);

export async function create(event: HttpEvent) {
  return route(event, async () => {
    const input: CreateItemInput = parseBody(event, CreateItemInputSchema);
    const item: Item = await service.create(input);
    return created(item);
  });
}

export async function list(event: HttpEvent) {
  return route(event, async () => {
    const items: Item[] = await service.list();
    return { items };
  });
}

export async function get(event: HttpEvent) {
  return route(event, async () => {
    const id = event.pathParameters?.id;
    if (!id) throw new HttpError(400, 'MISSING_ID', 'id é obrigatório');
    const result: Item = await service.get(id);
    return result;
  });
}
