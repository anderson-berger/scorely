import {
  dynamoSportRepository,
  type SportRepository,
  type StoredSport,
} from '@scorely/api/src/modules/sports/sport.repository';
import type { Sport, SportCatalog } from '@scorely/contracts';

/** ESP-07: por quanto tempo a api usa a cópia do catálogo sem reler o banco. */
const CACHE_MS = 5 * 60 * 1000;

function toSport({ id, name, positions, active }: StoredSport): Sport {
  return {
    id,
    name,
    positions: positions.map(({ id: p, name: n, active: a }) => ({ id: p, name: n, active: a })),
    active,
  };
}

export function createSportService(repo: SportRepository, now: () => Date = () => new Date()) {
  // ESP-07: uma cópia só, compartilhada por `catalog` e `get`, relida depois de 5 min.
  const cache: { sports: Sport[] | undefined; loadedAt: number } = { sports: undefined, loadedAt: 0 };

  async function load(): Promise<Sport[]> {
    const at = now().getTime();
    if (cache.sports && at - cache.loadedAt < CACHE_MS) return cache.sports;
    cache.sports = (await repo.list()).sort((a, b) => a.order - b.order).map(toSport);
    cache.loadedAt = at;
    return cache.sports;
  }

  return {
    /** ESP-05, 06, 07: todos os esportes, os desativados com `active: false`, na ordem do catálogo. */
    async catalog(): Promise<SportCatalog> {
      return { sports: await load() };
    },
    /** O esporte pelo id, inclusive desativado (ESP-05); fora do catálogo, `undefined`. */
    async get(id: string): Promise<Sport | undefined> {
      return (await load()).find((sport) => sport.id === id);
    },
  };
}
export type SportService = ReturnType<typeof createSportService>;

export const sportService = createSportService(dynamoSportRepository);
