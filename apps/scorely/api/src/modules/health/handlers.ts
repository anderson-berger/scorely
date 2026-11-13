import { type HttpEvent, route } from '@scorely/api/src/lib/http';

export async function health(event: HttpEvent) {
  return route(event, async () => {
    return { status: 'ok', time: new Date().toISOString() };
  });
}
