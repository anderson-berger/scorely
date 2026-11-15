import type { Sport, SportCatalog } from '@scorely/contracts';
import { sportsApi } from '@scorely/web/src/modules/sports/sports.api';
import { useSportsStore } from '@scorely/web/src/modules/sports/sports.store';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@scorely/web/src/modules/sports/sports.api', () => ({
  sportsApi: { catalog: vi.fn() },
}));

const catalog = vi.mocked(sportsApi.catalog);

const VOLLEYBALL: Sport = {
  id: 'volleyball',
  name: { 'pt-BR': 'Vôlei', en: 'Volleyball' },
  active: true,
  positions: [{ id: 'setter', name: { 'pt-BR': 'Levantador', en: 'Setter' }, active: true }],
};
const CRICKET: Sport = {
  id: 'cricket',
  name: { 'pt-BR': 'Críquete', en: 'Cricket' },
  active: false,
  positions: [],
};
const SOCCER: Sport = {
  id: 'soccer',
  name: { 'pt-BR': 'Futebol', en: 'Soccer' },
  active: true,
  positions: [],
};
const CATALOG: SportCatalog = { sports: [VOLLEYBALL, CRICKET, SOCCER] };

/** Pedido controlado: só termina quando o teste chama `resolve`. */
function deferred<T>() {
  const box: { resolve: (v: T) => void } = { resolve: () => undefined };
  const promise = new Promise<T>((resolve) => {
    box.resolve = resolve;
  });
  return { promise, resolve: (v: T) => box.resolve(v) };
}

beforeEach(() => {
  setActivePinia(createPinia());
  catalog.mockReset();
  catalog.mockResolvedValue(CATALOG);
});

describe('catálogo no web (ESP-08)', () => {
  it('ESP-08: load baixa o catálogo e guarda todos os esportes, na ordem do catálogo', async () => {
    const store = useSportsStore();
    await store.load();
    expect(catalog).toHaveBeenCalledTimes(1);
    expect(store.sports).toEqual([VOLLEYBALL, CRICKET, SOCCER]);
  });

  it('ESP-08: o 2º load da sessão não pede o catálogo de novo', async () => {
    const store = useSportsStore();
    await store.load();
    await store.load();
    expect(catalog).toHaveBeenCalledTimes(1);
  });

  it('ESP-08: dois load ao mesmo tempo fazem um pedido só', async () => {
    const pending = deferred<SportCatalog>();
    catalog.mockReturnValueOnce(pending.promise);
    const store = useSportsStore();
    const both = Promise.all([store.load(), store.load()]);
    pending.resolve(CATALOG);
    await both;
    expect(catalog).toHaveBeenCalledTimes(1);
    expect(store.sports).toEqual([VOLLEYBALL, CRICKET, SOCCER]);
  });

  it('ESP-05: byId acha também o esporte desativado (vale para quem já o tem)', async () => {
    const store = useSportsStore();
    await store.load();
    expect(store.byId('volleyball')).toEqual(VOLLEYBALL);
    expect(store.byId('cricket')).toEqual(CRICKET);
    expect(store.byId('unknown')).toBeUndefined();
  });

  it('ESP-05: o form de criar só oferece os ativos, na ordem do catálogo (ESP-06)', async () => {
    const store = useSportsStore();
    await store.load();
    expect(store.active).toEqual([VOLLEYBALL, SOCCER]);
  });
});
