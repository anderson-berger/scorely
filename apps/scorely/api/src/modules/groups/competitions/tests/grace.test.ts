import {
  ANA,
  code,
  POINTS,
  PUBLIC_ID,
  setup,
} from '@scorely/api/src/modules/groups/competitions/tests/fixtures';
import { describe, expect, it } from 'vitest';

// COM-04, 11: editar no prazo (os 3 dias depois do fim): só o nome muda.

async function inGrace() {
  const t = setup({ participants: [[ANA, 'member']], matchManagers: [], holders: [ANA], profiles: false });
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
