import { type HttpEvent, HttpResponse, route } from '@scorely/api/src/lib/http';
import { sportService } from '@scorely/api/src/modules/sports/sport.service';

/** ESP-07: o catálogo muda raramente; o navegador e a CDN guardam por 1 hora. */
const CATALOG_CACHE = { 'Cache-Control': 'public, max-age=3600' };

export async function listSports(event: HttpEvent) {
  return route(event, async () => new HttpResponse(200, await sportService.catalog(), CATALOG_CACHE));
}
