import { created, HttpError, type HttpEvent, parseBody, route } from '@base/api/src/lib/http';
import { dynamoItemRepository } from '@base/api/src/modules/items/data/items.repository';
import { CreateItemInputSchema } from '@base/api/src/modules/items/item.schema';
import { createItemService } from '@base/api/src/modules/items/items.service';

const service = createItemService(dynamoItemRepository);

export async function create(event: HttpEvent) {
  return route(event, async () => {
    const input = parseBody(event, CreateItemInputSchema);
    return created(await service.create(input));
  });
}

export async function list(event: HttpEvent) {
  return route(event, async () => {
    return { items: await service.list() };
  });
}

export async function get(event: HttpEvent) {
  return route(event, async () => {
    const id = event.pathParameters?.id;
    if (!id) throw new HttpError(400, 'MISSING_ID', 'id é obrigatório');
    const result = await service.get(id);
    return result;
  });
}
