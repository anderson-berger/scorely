import { handlers } from '../../lib/http';

export const { health } = handlers({
  async health() {
    return { status: 'ok', time: new Date().toISOString() };
  },
});
