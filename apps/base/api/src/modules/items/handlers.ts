import { created, HttpError, handlers, parseBody } from '../../lib/http';
import { dynamoItemRepository } from './item.repository';
import { CreateItemInputSchema } from './item.schema';
import { createItemService } from './item.service';

const service = createItemService(dynamoItemRepository);

export const { create, list, get } = handlers({
  async create(event) {
    const input = parseBody(event, CreateItemInputSchema);
    return created(await service.create(input));
  },

  async list() {
    return { items: await service.list() };
  },

  async get(event) {
    const id = event.pathParameters?.id;
    if (!id) throw new HttpError(400, 'MISSING_ID', 'id é obrigatório');
    return service.get(id);
  },
});
