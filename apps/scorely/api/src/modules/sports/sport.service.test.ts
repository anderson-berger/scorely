import type { SportRepository, StoredSport } from '@scorely/api/src/modules/sports/sport.repository';
import { createSportService } from '@scorely/api/src/modules/sports/sport.service';
import { SportCatalogSchema } from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

// Esportes (`.claude/work/esportes.md`): leitura do catálogo, ESP-05, 06 e 07.
// Interface do arquivo de trabalho: `createSportService(repo, now)` → `{ catalog(), get(id) }`, com a cópia na memória
// por 5 min compartilhada pelos dois. O repositório em memória devolve na ordem do `order`, como o real.

const MINUTE = 60 * 1000;
const T0 = new Date('2026-11-15T12:00:00.000Z');

const text = (pt: string, en: string) => ({ 'pt-BR': pt, en });

const VOLLEY: StoredSport = {
  id: 'volleyball',
  name: text('Vôlei', 'Volleyball'),
  positions: [
    { id: 'setter', name: text('Levantador', 'Setter'), active: true },
    { id: 'libero', name: text('Líbero', 'Libero'), active: true },
    { id: 'universal', name: text('Universal', 'Universal'), active: false },
  ],
  active: true,
  order: 0,
};
const SOCCER: StoredSport = {
  id: 'soccer',
  name: text('Futebol', 'Soccer'),
  positions: [{ id: 'goalkeeper', name: text('Goleiro', 'Goalkeeper'), active: true }],
  active: true,
  order: 1,
};
const CRICKET: StoredSport = {
  id: 'cricket',
  name: text('Críquete', 'Cricket'),
  positions: [],
  active: false,
  order: 2,
};

function memoryRepo(initial: StoredSport[]) {
  const items = new Map<string, StoredSport>(initial.map((s) => [s.id, structuredClone(s)]));
  const reads = { count: 0 };
  const repo: SportRepository = {
    async list() {
      reads.count += 1;
      return [...items.values()].sort((a, b) => a.order - b.order).map((s) => structuredClone(s));
    },
    async get(id) {
      reads.count += 1;
      const s = items.get(id);
      return s && structuredClone(s);
    },
    async save(sport) {
      items.set(sport.id, structuredClone(sport));
    },
  };
  return { repo, reads, items };
}

function setup(initial: StoredSport[] = [SOCCER, CRICKET, VOLLEY]) {
  const clock = { now: T0 };
  const mem = memoryRepo(initial);
  const service = createSportService(mem.repo, () => clock.now);
  const advance = (ms: number) => {
    clock.now = new Date(clock.now.getTime() + ms);
  };
  return { ...mem, clock, advance, service };
}

describe('catálogo de esportes (ESP-05, 06, 07)', () => {
  it('ESP-07: o catálogo traz todos os esportes, os desativados com active: false, no formato do contrato', async () => {
    const t = setup();
    const catalog = await t.service.catalog();
    expect(SportCatalogSchema.safeParse(catalog).success).toBe(true);
    expect(catalog.sports.map((s) => [s.id, s.active])).toEqual([
      ['volleyball', true],
      ['soccer', true],
      ['cricket', false],
    ]);
  });

  it('ESP-06: o catálogo vem na ordem do arquivo (order), e as posições na ordem gravada', async () => {
    const t = setup();
    const catalog = await t.service.catalog();
    expect(catalog.sports.map((s) => s.id)).toEqual(['volleyball', 'soccer', 'cricket']);
    expect(catalog.sports[0]?.positions.map((p) => p.id)).toEqual(['setter', 'libero', 'universal']);
  });

  it('ESP-05: esporte e posição desativados continuam no catálogo, com o nome', async () => {
    const t = setup();
    const catalog = await t.service.catalog();
    expect(catalog.sports.find((s) => s.id === 'cricket')).toMatchObject({
      name: text('Críquete', 'Cricket'),
      active: false,
    });
    expect(catalog.sports[0]?.positions.find((p) => p.id === 'universal')).toEqual({
      id: 'universal',
      name: text('Universal', 'Universal'),
      active: false,
    });
  });

  it('ESP-05: get devolve o esporte desativado (com active: false), e o desconhecido como undefined', async () => {
    const t = setup();
    expect(await t.service.get('cricket')).toMatchObject({ id: 'cricket', active: false });
    expect(await t.service.get('volleyball')).toMatchObject({
      id: 'volleyball',
      name: text('Vôlei', 'Volleyball'),
      active: true,
    });
    expect(await t.service.get('curling')).toBeUndefined();
  });

  it('ESP-07: o 2º pedido em menos de 5 min não lê o banco (catalog e get usam a mesma cópia)', async () => {
    const t = setup();
    await t.service.catalog();
    const afterFirst = t.reads.count;
    expect(afterFirst).toBeGreaterThan(0);

    t.advance(4 * MINUTE + 59 * 1000);
    await t.service.catalog();
    expect(await t.service.get('soccer')).toMatchObject({ id: 'soccer' });
    expect(await t.service.get('curling')).toBeUndefined();
    expect(t.reads.count).toBe(afterFirst);
  });

  it('ESP-07: o get primeiro também guarda a cópia para o catalog', async () => {
    const t = setup();
    await t.service.get('volleyball');
    const afterFirst = t.reads.count;
    t.advance(MINUTE);
    expect((await t.service.catalog()).sports).toHaveLength(3);
    expect(t.reads.count).toBe(afterFirst);
  });

  it('ESP-07: depois de 5 min a api relê o banco, e um sync aparece', async () => {
    const t = setup();
    await t.service.catalog();
    await t.repo.save({ ...SOCCER, name: text('Futebol de campo', 'Soccer'), order: 1 });

    t.advance(MINUTE);
    expect((await t.service.get('soccer'))?.name['pt-BR']).toBe('Futebol');

    t.advance(4 * MINUTE + 1000);
    expect((await t.service.get('soccer'))?.name['pt-BR']).toBe('Futebol de campo');
    const catalog = await t.service.catalog();
    expect(catalog.sports.find((s) => s.id === 'soccer')?.name['pt-BR']).toBe('Futebol de campo');
  });
});
