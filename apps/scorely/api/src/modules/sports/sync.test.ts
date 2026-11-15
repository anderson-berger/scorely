import type { CatalogEntry } from '@scorely/api/src/modules/sports/catalog';
import type { SportRepository, StoredSport } from '@scorely/api/src/modules/sports/sport.repository';
import { syncCatalog } from '@scorely/api/src/modules/sports/sync';
import { describe, expect, it } from 'vitest';

// Esportes (`.claude/work/esportes.md`): o `sports:sync` aplica o arquivo do catálogo no banco, ESP-01, 02, 03, 05 e 06.
// Interface do arquivo de trabalho: `syncCatalog(repo, entries)` valida tudo antes de gravar (Error com a lista dos
// problemas), grava os do arquivo ativos com `order` = índice e desativa (sem apagar) o que sumiu.

const text = (pt: string, en: string) => ({ 'pt-BR': pt, en });
const pos = (id: string, pt = id, en = id) => ({ id, name: text(pt, en) });

const VOLLEY: CatalogEntry = {
  id: 'volleyball',
  name: text('Vôlei', 'Volleyball'),
  positions: [
    pos('setter', 'Levantador', 'Setter'),
    pos('middle', 'Central', 'Middle blocker'),
    pos('libero'),
  ],
};
const SOCCER: CatalogEntry = {
  id: 'soccer',
  name: text('Futebol', 'Soccer'),
  positions: [pos('goalkeeper'), pos('forward')],
};
const FOOTVOLLEY: CatalogEntry = { id: 'footvolley', name: text('Futevôlei', 'Footvolley'), positions: [] };

function memoryRepo(initial: StoredSport[] = []) {
  const items = new Map<string, StoredSport>(initial.map((s) => [s.id, structuredClone(s)]));
  const saves: StoredSport[] = [];
  const repo: SportRepository = {
    async list() {
      return [...items.values()].sort((a, b) => a.order - b.order).map((s) => structuredClone(s));
    },
    async get(id) {
      const s = items.get(id);
      return s && structuredClone(s);
    },
    async save(sport) {
      saves.push(structuredClone(sport));
      items.set(sport.id, structuredClone(sport));
    },
  };
  /** O que está gravado, na ordem do `order` (só os dados do catálogo, sem `version`/`updatedAt`). */
  const stored = () =>
    [...items.values()]
      .sort((a, b) => a.order - b.order)
      .map(({ id, name, positions, active, order }) => ({ id, name, positions, active, order }));
  return { repo, saves, items, stored };
}

async function rejection(p: Promise<unknown>): Promise<Error> {
  const err = await p.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(Error);
  return err as Error;
}

describe('sports:sync aplica o arquivo do catálogo (ESP-01, 06)', () => {
  it('ESP-01: o sync grava no banco cada esporte do arquivo, ativo, com o nome e as posições ativas', async () => {
    const t = memoryRepo();
    await syncCatalog(t.repo, [VOLLEY, SOCCER]);
    expect(t.stored()).toMatchObject([
      {
        id: 'volleyball',
        name: text('Vôlei', 'Volleyball'),
        active: true,
        positions: [
          { id: 'setter', name: text('Levantador', 'Setter'), active: true },
          { id: 'middle', name: text('Central', 'Middle blocker'), active: true },
          { id: 'libero', name: text('libero', 'libero'), active: true },
        ],
      },
      { id: 'soccer', active: true },
    ]);
  });

  it('ESP-06: a ordem gravada é a do arquivo (order = índice), e a das posições também', async () => {
    const t = memoryRepo();
    await syncCatalog(t.repo, [SOCCER, FOOTVOLLEY, VOLLEY]);
    expect(t.stored().map((s) => [s.id, s.order])).toEqual([
      ['soccer', 0],
      ['footvolley', 1],
      ['volleyball', 2],
    ]);
    expect(t.items.get('volleyball')?.positions.map((p) => p.id)).toEqual(['setter', 'middle', 'libero']);
  });

  it('ESP-06: mudar a ordem no arquivo muda a ordem gravada; rodar de novo o mesmo arquivo não muda nada', async () => {
    const t = memoryRepo();
    await syncCatalog(t.repo, [VOLLEY, SOCCER]);
    await syncCatalog(t.repo, [SOCCER, VOLLEY]);
    expect(t.stored().map((s) => s.id)).toEqual(['soccer', 'volleyball']);
    const before = structuredClone(t.stored());
    await syncCatalog(t.repo, [SOCCER, VOLLEY]);
    expect(t.stored()).toEqual(before);
  });

  it('ESP-01: mudar o nome de um esporte ou de uma posição no arquivo atualiza o banco', async () => {
    const t = memoryRepo();
    await syncCatalog(t.repo, [VOLLEY]);
    await syncCatalog(t.repo, [
      {
        ...VOLLEY,
        name: text('Voleibol', 'Volleyball'),
        positions: [pos('setter', 'Levantadora', 'Setter')],
      },
    ]);
    expect(t.items.get('volleyball')?.name).toEqual(text('Voleibol', 'Volleyball'));
    expect(t.items.get('volleyball')?.positions[0]).toEqual({
      id: 'setter',
      name: text('Levantadora', 'Setter'),
      active: true,
    });
  });
});

describe('sports:sync nunca apaga, desativa (ESP-05)', () => {
  it('ESP-05: esporte que saiu do arquivo fica active: false, com o nome e as posições, depois dos do arquivo', async () => {
    const t = memoryRepo();
    await syncCatalog(t.repo, [VOLLEY, SOCCER, FOOTVOLLEY]);
    await syncCatalog(t.repo, [FOOTVOLLEY]);
    expect(t.stored().map((s) => [s.id, s.active])).toEqual([
      ['footvolley', true],
      ['volleyball', false],
      ['soccer', false],
    ]);
    expect(t.items.get('volleyball')).toMatchObject({
      name: text('Vôlei', 'Volleyball'),
      positions: [{ id: 'setter' }, { id: 'middle' }, { id: 'libero' }],
    });
    expect(t.items.size).toBe(3);
  });

  it('ESP-05: os desativados mantêm a ordem relativa entre si, sempre depois dos do arquivo', async () => {
    const t = memoryRepo();
    await syncCatalog(t.repo, [SOCCER, VOLLEY]);
    await syncCatalog(t.repo, [FOOTVOLLEY]);
    await syncCatalog(t.repo, [
      FOOTVOLLEY,
      { ...SOCCER, id: 'basketball', name: text('Basquete', 'Basketball') },
    ]);
    expect(t.stored().map((s) => [s.id, s.active])).toEqual([
      ['footvolley', true],
      ['basketball', true],
      ['soccer', false],
      ['volleyball', false],
    ]);
  });

  it('ESP-05: esporte que volta ao arquivo fica ativo de novo, na posição do arquivo', async () => {
    const t = memoryRepo();
    await syncCatalog(t.repo, [VOLLEY, SOCCER]);
    await syncCatalog(t.repo, [SOCCER]);
    await syncCatalog(t.repo, [VOLLEY, SOCCER]);
    expect(t.stored().map((s) => [s.id, s.active, s.order])).toEqual([
      ['volleyball', true, 0],
      ['soccer', true, 1],
    ]);
  });

  it('ESP-05: posição que saiu do arquivo fica active: false, no fim da lista do esporte, com o nome', async () => {
    const t = memoryRepo();
    await syncCatalog(t.repo, [VOLLEY]);
    await syncCatalog(t.repo, [{ ...VOLLEY, positions: [pos('libero'), pos('opposite')] }]);
    expect(t.items.get('volleyball')?.positions).toEqual([
      { id: 'libero', name: text('libero', 'libero'), active: true },
      { id: 'opposite', name: text('opposite', 'opposite'), active: true },
      { id: 'setter', name: text('Levantador', 'Setter'), active: false },
      { id: 'middle', name: text('Central', 'Middle blocker'), active: false },
    ]);
  });

  it('ESP-05: posição que volta ao arquivo fica ativa de novo, na ordem do arquivo', async () => {
    const t = memoryRepo();
    await syncCatalog(t.repo, [VOLLEY]);
    await syncCatalog(t.repo, [{ ...VOLLEY, positions: [pos('libero')] }]);
    await syncCatalog(t.repo, [VOLLEY]);
    expect(t.items.get('volleyball')?.positions.map((p) => [p.id, p.active])).toEqual([
      ['setter', true],
      ['middle', true],
      ['libero', true],
    ]);
  });

  it('ESP-05: arquivo vazio desativa todos e não apaga nenhum', async () => {
    const t = memoryRepo();
    await syncCatalog(t.repo, [VOLLEY, SOCCER]);
    await syncCatalog(t.repo, []);
    expect(t.stored().map((s) => [s.id, s.active])).toEqual([
      ['volleyball', false],
      ['soccer', false],
    ]);
  });
});

describe('sports:sync recusa o arquivo inválido, sem gravar nada (ESP-02, 03)', () => {
  it('ESP-02: id de esporte fora do formato (2 a 40, minúsculas, números e _) → Error com o id, sem gravar', async () => {
    for (const id of ['x', 'Volleyball', 'beach-volleyball', 'vôlei', 'a'.repeat(41)]) {
      const t = memoryRepo();
      const err = await rejection(syncCatalog(t.repo, [SOCCER, { ...VOLLEY, id }]));
      expect(err.message).toContain(id);
      expect(t.saves).toEqual([]);
    }
  });

  it('ESP-02: o formato aceita minúsculas, números e _ de 2 a 40 caracteres', async () => {
    const t = memoryRepo();
    await syncCatalog(t.repo, [
      { ...VOLLEY, id: 'beach_volleyball' },
      { ...SOCCER, id: 'f5' },
      { ...FOOTVOLLEY, id: 'a'.repeat(40) },
    ]);
    expect(t.stored().map((s) => s.id)).toEqual(['beach_volleyball', 'f5', 'a'.repeat(40)]);
  });

  it('ESP-02: id de posição fora do formato → Error com o id, sem gravar', async () => {
    const t = memoryRepo();
    const err = await rejection(
      syncCatalog(t.repo, [{ ...VOLLEY, positions: [pos('setter'), pos('Libero')] }]),
    );
    expect(err.message).toContain('Libero');
    expect(t.saves).toEqual([]);
  });

  it('ESP-02: id de esporte repetido no arquivo → Error, sem gravar', async () => {
    const t = memoryRepo();
    const err = await rejection(syncCatalog(t.repo, [VOLLEY, SOCCER, { ...FOOTVOLLEY, id: 'volleyball' }]));
    expect(err.message).toContain('volleyball');
    expect(t.saves).toEqual([]);
  });

  it('ESP-02: posição repetida dentro do esporte → Error, sem gravar; a mesma posição em esportes diferentes vale', async () => {
    const t = memoryRepo();
    const err = await rejection(
      syncCatalog(t.repo, [{ ...VOLLEY, positions: [pos('setter'), pos('libero'), pos('setter')] }]),
    );
    expect(err.message).toContain('setter');
    expect(t.saves).toEqual([]);

    await syncCatalog(t.repo, [VOLLEY, { ...SOCCER, positions: [pos('setter')] }]);
    expect(t.items.get('soccer')?.positions.map((p) => p.id)).toEqual(['setter']);
  });

  it('ESP-03: esporte sem o nome em algum idioma (ou com nome vazio) → Error com o id, sem gravar', async () => {
    const missing = [
      { 'pt-BR': 'Vôlei' },
      { en: 'Volleyball' },
      { 'pt-BR': 'Vôlei', en: '   ' },
    ] as unknown as CatalogEntry['name'][];
    for (const name of missing) {
      const t = memoryRepo();
      const err = await rejection(syncCatalog(t.repo, [SOCCER, { ...VOLLEY, name }]));
      expect(err.message).toContain('volleyball');
      expect(t.saves).toEqual([]);
    }
  });

  it('ESP-03: posição sem o nome em algum idioma → Error com o id da posição, sem gravar', async () => {
    const t = memoryRepo();
    const broken = {
      id: 'libero',
      name: { 'pt-BR': 'Líbero' },
    } as unknown as CatalogEntry['positions'][number];
    const err = await rejection(syncCatalog(t.repo, [{ ...VOLLEY, positions: [pos('setter'), broken] }]));
    expect(err.message).toContain('libero');
    expect(t.saves).toEqual([]);
  });

  it('ESP-02 / ESP-03: o Error lista todos os problemas do arquivo, não só o primeiro', async () => {
    const t = memoryRepo();
    const noEnglish = { 'pt-BR': 'Futevôlei' } as unknown as CatalogEntry['name'];
    const err = await rejection(
      syncCatalog(t.repo, [{ ...VOLLEY, id: 'Bad-Id' }, SOCCER, { ...FOOTVOLLEY, name: noEnglish }]),
    );
    expect(err.message).toContain('Bad-Id');
    expect(err.message).toContain('footvolley');
    expect(t.saves).toEqual([]);
  });

  it('ESP-05: arquivo inválido não desativa nada do que já está gravado', async () => {
    const t = memoryRepo();
    await syncCatalog(t.repo, [VOLLEY, SOCCER]);
    const before = structuredClone(t.stored());
    await rejection(syncCatalog(t.repo, [{ ...VOLLEY, id: 'X' }]));
    expect(t.stored()).toEqual(before);
  });
});
