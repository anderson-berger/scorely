import { type HttpEvent, route } from '@scorely/api/src/lib/http';

export async function health(event: HttpEvent) {
  return route(event, async () => {
    const time = new Date().toISOString();
    return { status: 'ok', time };
  });
}
