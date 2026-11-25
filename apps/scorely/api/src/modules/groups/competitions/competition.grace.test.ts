import { appError } from '@scorely/api/src/lib/errors';
import { asGroupId, asPublicGroupId, asUserId } from '@scorely/api/src/lib/ids';
import { createCompetitionService } from '@scorely/api/src/modules/groups/competitions/competition.service';
import { memoryCompetitions } from '@scorely/api/src/modules/groups/competitions/competitions.memory';
import type { GroupAccess } from '@scorely/api/src/modules/groups/group.access';
import { memoryMatches } from '@scorely/api/src/modules/groups/matches/matches.memory';
import { describe, expect, it } from 'vitest';

// COM-04, 11: editar no prazo (os 3 dias depois do fim): só o nome muda.

const ANA = asUserId('11111111-1111-4111-8111-111111111111');
const PUBLIC_ID = asPublicGroupId('K3X9PQ2A');
const GROUP_ID = asGroupId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
const POINTS = { win: 3, draw: 1, loss: 0 };

function setup() {
  const clock = { now: new Date('2026-11-25T15:00:00.000Z') };
  const groups: GroupAccess = {
    access: async (userId, publicId) => {
      if (userId !== ANA || publicId !== PUBLIC_ID) throw appError('GROUP_NOT_FOUND');
      return {
        groupId: GROUP_ID,
        publicId: PUBLIC_ID,
        name: 'Pelada de sexta',
        tier: 'member',
        permissions: ['competitions.manage'],
      };
    },
    participants: async () => new Map([[ANA, 'member' as const]]),
    holders: async () => [ANA],
  };
  const store = memoryMatches();
  const service = createCompetitionService({
    competitions: memoryCompetitions(store).repo,
    matches: store.repo,
    groups,
    users: { getMany: async () => [] },
    now: () => clock.now,
  });
  return { service, clock };
}

async function inGrace() {
  const t = setup();
  // De 25/11 a 01/12 (7 dias); no prazo de 02/12 a 04/12, em São Paulo.
  const c = await t.service.create(ANA, PUBLIC_ID, {
    type: 'season',
    endDate: '2026-12-01',
    timeZone: 'America/Sao_Paulo',
    points: POINTS,
    seriesIds: [],
  });
  t.clock.now = new Date('2026-12-03T15:00:00.000Z');
  return { ...t, c };
}

const code = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    (err: { code: string }) => err.code,
  );

describe('COM-11: no prazo, só o nome muda', () => {
  it('COM-11: o nome muda no prazo, com o fim e os pontos como estão', async () => {
    const { service, c } = await inGrace();
    const view = await service.get(ANA, PUBLIC_ID, c.id, 'all');
    expect(view.status).toBe('grace');
    expect(view.actions).toEqual({ manage: true, editPoints: false });
    const saved = await service.update(ANA, PUBLIC_ID, c.id, {
      name: 'Copa',
      endDate: '2026-12-01',
      points: POINTS,
      expectedVersion: view.version,
    });
    expect(saved).toMatchObject({ name: 'Copa', endDate: '2026-12-01', status: 'grace' });
  });

  it('COM-11: no prazo, mudar o fim (nem para reabrir) ou os pontos responde VALIDATION_ERROR', async () => {
    const { service, c } = await inGrace();
    const edit = (endDate: string, points = POINTS) =>
      code(service.update(ANA, PUBLIC_ID, c.id, { endDate, points, expectedVersion: c.version }));
    expect(await edit('2026-12-20')).toBe('VALIDATION_ERROR');
    expect(await edit('2026-12-01', { win: 2, draw: 1, loss: 0 })).toBe('VALIDATION_ERROR');
  });
});
