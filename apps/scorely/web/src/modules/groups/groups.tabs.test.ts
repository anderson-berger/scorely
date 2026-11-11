import type { MyGroup } from '@scorely/contracts';
import { describe, expect, it } from 'vitest';
import { ApiRequestError } from '@/lib/http';
import { cardLine, gameUnlessArchived, groupColor, groupsTab, sortByNextGame } from './groups';

// Plano 014: tela de Grupos em abas com cards de capa.

type Status = MyGroup['game']['status'];
type CardGroup = Pick<MyGroup, 'myRole' | 'listOpensHoursBefore' | 'reservesOpenHoursBefore' | 'game'>;

const HOUR = 3_600_000;
// segunda, 2026-11-09 12:00Z
const now = new Date('2026-11-09T12:00:00.000Z');
const inHours = (h: number) => new Date(now.getTime() + h * HOUR).toISOString();

const game = (id: string, startsAt: string, status: Status = 'open') => ({ id, game: { startsAt, status } });

const cardGroup = (overrides: {
  myRole?: CardGroup['myRole'];
  listOpensHoursBefore?: number;
  reservesOpenHoursBefore?: number;
  game?: Partial<CardGroup['game']>;
}): CardGroup => ({
  myRole: overrides.myRole ?? 'member',
  listOpensHoursBefore: overrides.listOpensHoursBefore ?? 48,
  reservesOpenHoursBefore: overrides.reservesOpenHoursBefore ?? 24,
  game: {
    date: '2026-11-10',
    startsAt: inHours(10),
    status: 'open',
    slots: 8,
    confirmedCount: 0,
    ...overrides.game,
  },
});

describe('groupsTab', () => {
  it('caso 1: sem query → next', () => {
    expect(groupsTab({}, false)).toBe('next');
  });

  it('caso 1: tab=owned → owned; tab=joined → joined', () => {
    expect(groupsTab({ tab: 'owned' }, false)).toBe('owned');
    expect(groupsTab({ tab: 'joined' }, false)).toBe('joined');
  });

  it('caso 1: valor desconhecido ou array → next', () => {
    expect(groupsTab({ tab: 'xyz' }, false)).toBe('next');
    expect(groupsTab({ tab: ['owned'] }, false)).toBe('next');
  });
});

describe('sortByNextGame', () => {
  const tue = '2026-11-10T22:00:00.000Z';
  const wed = '2026-11-11T22:00:00.000Z';
  const fri = '2026-11-13T22:00:00.000Z';

  it('caso 2: jogos em sex, ter e qua → ter, qua, sex', () => {
    const groups = [game('fri', fri), game('tue', tue), game('wed', wed)];
    expect(sortByNextGame(groups).map((g) => g.id)).toEqual(['tue', 'wed', 'fri']);
  });

  it('caso 3: cancelado na ter e aberto na sex → sex, depois ter', () => {
    const groups = [game('tue', tue, 'cancelled'), game('fri', fri, 'open')];
    expect(sortByNextGame(groups).map((g) => g.id)).toEqual(['fri', 'tue']);
  });

  it('caso 4: empate no startsAt mantém a ordem de entrada', () => {
    const groups = [game('b', tue), game('a', tue), game('c', wed)];
    expect(sortByNextGame(groups).map((g) => g.id)).toEqual(['b', 'a', 'c']);
  });

  it('caso 4: não altera o array recebido', () => {
    const groups = [game('fri', fri), game('tue', tue)];
    const copy = [...groups];
    sortByNextGame(groups);
    expect(groups).toEqual(copy);
  });
});

describe('cardLine', () => {
  it('caso 5: cancelado, mesmo com me → cancelled', () => {
    const g = cardGroup({ game: { status: 'cancelled', me: { list: 'confirmed', position: 1 } } });
    expect(cardLine(g, now)).toEqual({ kind: 'cancelled' });
  });

  it('caso 6: em andamento → in_progress', () => {
    const g = cardGroup({ game: { status: 'in_progress', startsAt: inHours(-1) } });
    expect(cardLine(g, now)).toEqual({ kind: 'in_progress' });
  });

  it('caso 7: na lista → playing com a posição', () => {
    const g = cardGroup({ game: { me: { list: 'confirmed', position: 3 }, confirmedCount: 5 } });
    expect(cardLine(g, now)).toEqual({ kind: 'playing', position: 3 });
  });

  it('caso 8: na fila → waiting com a posição', () => {
    const g = cardGroup({ game: { me: { list: 'waitlist', position: 2 }, confirmedCount: 8 } });
    expect(cardLine(g, now)).toEqual({ kind: 'waiting', position: 2 });
  });

  it('caso 9: membro, camada de 48h, jogo daqui a 72h → opens em startsAt − 48h', () => {
    const g = cardGroup({
      myRole: 'member',
      listOpensHoursBefore: 48,
      game: { startsAt: inHours(72), status: 'scheduled' },
    });
    const line = cardLine(g, now);
    expect(line.kind).toBe('opens');
    expect(new Date((line as { at: string }).at).getTime()).toBe(now.getTime() + 24 * HOUR);
  });

  it('caso 10: reserva, camada de 24h, jogo daqui a 30h (aberto para membros) → opens em startsAt − 24h', () => {
    const g = cardGroup({
      myRole: 'reserve',
      reservesOpenHoursBefore: 24,
      listOpensHoursBefore: 48,
      game: { startsAt: inHours(30), status: 'open' },
    });
    const line = cardLine(g, now);
    expect(line.kind).toBe('opens');
    expect(new Date((line as { at: string }).at).getTime()).toBe(now.getTime() + 6 * HOUR);
  });

  it('caso 11: camada abrindo exatamente em now conta como aberta (vagas)', () => {
    const g = cardGroup({
      myRole: 'member',
      listOpensHoursBefore: 48,
      game: { startsAt: inHours(48), status: 'open', confirmedCount: 6, slots: 8 },
    });
    expect(cardLine(g, now)).toEqual({ kind: 'spots', count: 2 });
  });

  it('caso 11: camada de reserva abrindo exatamente em now com lista cheia → full', () => {
    const g = cardGroup({
      myRole: 'reserve',
      reservesOpenHoursBefore: 24,
      game: { startsAt: inHours(24), status: 'open', confirmedCount: 8, slots: 8 },
    });
    expect(cardLine(g, now)).toEqual({ kind: 'full' });
  });

  it('caso 12: aberto, sem me, 6 de 8 → spots 2', () => {
    const g = cardGroup({ game: { confirmedCount: 6, slots: 8 } });
    expect(cardLine(g, now)).toEqual({ kind: 'spots', count: 2 });
  });

  it('caso 13: confirmedCount igual a slots → full', () => {
    const g = cardGroup({ game: { confirmedCount: 8, slots: 8 } });
    expect(cardLine(g, now)).toEqual({ kind: 'full' });
  });
});

describe('groupColor', () => {
  const ids = [
    '8ab49754-09f2-4094-bece-02eae9c855d5',
    '2d7e2b07-6d7f-4f7b-a959-230f3f478230',
    '02568c24-26e7-480c-a52e-4fd7aa43bce4',
    'c62e40b3-4af7-4ec6-adae-d091de97d877',
    '3c676be1-d0bd-4e15-92b7-02804a646b70',
    '11ff8681-8e80-4b2c-9de8-a214bdaf4c1f',
    '08e8607d-9805-41a0-906a-5182c14acc0c',
    '1c0e3883-2605-4aca-9416-902e653b5050',
    'c76dd5b4-9ce8-425d-b23c-105279b93bea',
    '2380ba5b-21a3-40f0-bb45-2ee247cc74ef',
  ];

  it('caso 14: devolve um número de 1 a 6', () => {
    for (const id of ids) {
      expect([1, 2, 3, 4, 5, 6]).toContain(groupColor(id));
    }
  });

  it('caso 14: mesmo id → mesmo número', () => {
    for (const id of ids) {
      expect(groupColor(id)).toBe(groupColor(id));
    }
  });

  it('caso 14: pelo menos 3 cores diferentes para 10 ids distintos', () => {
    expect(new Set(ids.map(groupColor)).size).toBeGreaterThanOrEqual(3);
  });
});

// Telas do arquivamento (GRP-27, GRP-28).
describe('arquivados', () => {
  const archivedAt = '2026-11-08T15:30:00.000Z';

  it('GRP-27: tab=archived com grupo arquivado → archived', () => {
    expect(groupsTab({ tab: 'archived' }, true)).toBe('archived');
  });

  it('GRP-27: tab=archived sem nenhum arquivado → cai em next', () => {
    expect(groupsTab({ tab: 'archived' }, false)).toBe('next');
  });

  it('GRP-27: as outras abas não dependem de haver arquivado', () => {
    expect(groupsTab({ tab: 'owned' }, true)).toBe('owned');
    expect(groupsTab({ tab: 'joined' }, true)).toBe('joined');
    expect(groupsTab({}, true)).toBe('next');
    expect(groupsTab({ tab: 'xyz' }, true)).toBe('next');
  });

  it('GRP-28: grupo arquivado, sem jogo → "Arquivado em {data}" com o archivedAt', () => {
    const g = {
      myRole: 'member' as const,
      listOpensHoursBefore: 48,
      reservesOpenHoursBefore: 24,
      archivedAt,
    };
    expect(cardLine(g, now)).toEqual({ kind: 'archived', at: archivedAt });
  });

  it('GRP-28: arquivado vem antes de tudo, mesmo com jogo cancelado ou com o usuário na lista', () => {
    const cancelled = { ...cardGroup({ game: { status: 'cancelled' } }), archivedAt };
    const playing = { ...cardGroup({ game: { me: { list: 'confirmed', position: 1 } } }), archivedAt };
    expect(cardLine(cancelled, now)).toEqual({ kind: 'archived', at: archivedAt });
    expect(cardLine(playing, now)).toEqual({ kind: 'archived', at: archivedAt });
  });
});

// GRP-37: com o grupo arquivado, a página não tem jogo e não mostra erro.
describe('gameUnlessArchived', () => {
  it('GRP-37: o jogo carrega → devolve o jogo', async () => {
    const loaded = { id: 'g1' };
    await expect(gameUnlessArchived(() => Promise.resolve(loaded))).resolves.toBe(loaded);
  });

  it('GRP-37: o jogo responde GROUP_ARCHIVED → sem jogo (null), sem erro', async () => {
    const archived = new ApiRequestError(409, 'GROUP_ARCHIVED', 'Group is archived');
    await expect(gameUnlessArchived(() => Promise.reject(archived))).resolves.toBeNull();
  });

  it('GRP-37: outro erro da api é relançado igual', async () => {
    const notFound = new ApiRequestError(404, 'GROUP_NOT_FOUND', 'Group not found');
    await expect(gameUnlessArchived(() => Promise.reject(notFound))).rejects.toBe(notFound);
  });

  it('GRP-37: erro que não é da api é relançado igual', async () => {
    const network = new Error('Network Error');
    await expect(gameUnlessArchived(() => Promise.reject(network))).rejects.toBe(network);
  });
});
