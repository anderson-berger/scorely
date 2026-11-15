import { SportCatalogSchema } from '@scorely/contracts';
import { request } from '@scorely/web/src/lib/http';

export const sportsApi = {
  /** ESP-07: o catálogo é público; a resposta vem com cache de 1 hora. */
  catalog: () => request({ url: '/sports' }, SportCatalogSchema),
};
