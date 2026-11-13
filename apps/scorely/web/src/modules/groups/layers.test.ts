import { GROUP_LIMITS } from '@scorely/contracts';
import {
  changeLayer,
  HOURS_LADDER,
  layerOpensAt,
  layerTimeline,
  nextLayer,
  stepHours,
  stepSlots,
} from '@scorely/web/src/modules/groups/layers';
import { describe, expect, it } from 'vitest';

const MAX = 144;

describe('HOURS_LADDER', () => {
  it('D6: escada fixa de horas', () => {
    expect(HOURS_LADDER).toEqual([0, 1, 2, 3, 4, 6, 8, 12, 18, 24, 36, 48, 72, 96, 120, 144]);
  });
});

describe('stepHours', () => {
  it('caso 5: subindo vai para o degrau vizinho', () => {
    expect(stepHours(24, 1, 0, MAX)).toBe(36);
    expect(stepHours(4, 1, 0, MAX)).toBe(6);
  });

  it('caso 5: para no máximo', () => {
    expect(stepHours(144, 1, 0, MAX)).toBe(144);
  });

  it('caso 6: descendo vai para o degrau vizinho', () => {
    expect(stepHours(36, -1, 0, MAX)).toBe(24);
  });

  it('caso 6: para no mínimo (1 para os membros, 0 para as outras camadas)', () => {
    expect(stepHours(1, -1, 1, MAX)).toBe(1);
    expect(stepHours(0, -1, 0, MAX)).toBe(0);
  });

  it('caso 7: valor fora da escada vai para o degrau mais próximo na direção', () => {
    expect(stepHours(30, 1, 0, MAX)).toBe(36);
    expect(stepHours(30, -1, 0, MAX)).toBe(24);
    expect(stepHours(5, -1, 0, MAX)).toBe(4);
  });
});

describe('changeLayer', () => {
  it('caso 8: membros descendo puxam reservas e convidados para baixo', () => {
    const first = changeLayer({ members: 48, reserves: 48, guests: 24 }, 'members', 24);
    expect(first).toEqual({ members: 24, reserves: 24, guests: 24 });
    expect(changeLayer(first, 'members', 12)).toEqual({ members: 12, reserves: 12, guests: 12 });
  });

  it('caso 9: reservas subindo empurram membros para cima', () => {
    expect(changeLayer({ members: 24, reserves: 12, guests: 6 }, 'reserves', 36)).toEqual({
      members: 36,
      reserves: 36,
      guests: 6,
    });
  });

  it('caso 9: convidados subindo empurram reservas e membros para cima', () => {
    expect(changeLayer({ members: 24, reserves: 12, guests: 6 }, 'guests', 48)).toEqual({
      members: 48,
      reserves: 48,
      guests: 48,
    });
  });

  it('caso 9: valores acima de 144 ficam em 144', () => {
    expect(changeLayer({ members: 24, reserves: 12, guests: 6 }, 'guests', 200)).toEqual({
      members: 144,
      reserves: 144,
      guests: 144,
    });
    expect(changeLayer({ members: 24, reserves: 12, guests: 6 }, 'members', 200).members).toBe(144);
  });

  it('caso 10: desligar convidados → guests null', () => {
    expect(changeLayer({ members: 24, reserves: 12, guests: 6 }, 'guests', null)).toEqual({
      members: 24,
      reserves: 12,
      guests: null,
    });
  });

  it('caso 10: mexer em membros ou reservas com convidados desligados mantém null', () => {
    expect(changeLayer({ members: 48, reserves: 48, guests: null }, 'members', 12)).toEqual({
      members: 12,
      reserves: 12,
      guests: null,
    });
    expect(changeLayer({ members: 24, reserves: 12, guests: null }, 'reserves', 36)).toEqual({
      members: 36,
      reserves: 36,
      guests: null,
    });
  });

  it('caso 10: religar convidados (6) com reservas em 4 → guests 4', () => {
    expect(changeLayer({ members: 24, reserves: 4, guests: null }, 'guests', 6)).toEqual({
      members: 24,
      reserves: 4,
      guests: 4,
    });
  });
});

describe('layerOpensAt', () => {
  it('caso 11: jogo sexta 19:30, 48h → quarta 19:30', () => {
    expect(layerOpensAt(5, '19:30', 48)).toEqual({ weekday: 3, time: '19:30' });
  });

  it('caso 11: jogo sexta 19:30, 6h → sexta 13:30', () => {
    expect(layerOpensAt(5, '19:30', 6)).toEqual({ weekday: 5, time: '13:30' });
  });

  it('caso 11: jogo sexta 19:30, 0h → sexta 19:30', () => {
    expect(layerOpensAt(5, '19:30', 0)).toEqual({ weekday: 5, time: '19:30' });
  });

  it('caso 11: jogo sexta 19:30, 144h → sábado (semana anterior) 19:30', () => {
    expect(layerOpensAt(5, '19:30', 144)).toEqual({ weekday: 6, time: '19:30' });
  });

  it('caso 11: jogo domingo 08:00, 12h → sábado 20:00 (vira o dia para trás)', () => {
    expect(layerOpensAt(0, '08:00', 12)).toEqual({ weekday: 6, time: '20:00' });
  });
});

describe('stepSlots', () => {
  it('caso 12: sobe de 1 em 1', () => {
    expect(stepSlots(12, 1)).toBe(13);
  });

  it('caso 12: para no mínimo do GROUP_LIMITS', () => {
    expect(stepSlots(GROUP_LIMITS.slots.min, -1)).toBe(2);
  });

  it('caso 12: para no máximo do GROUP_LIMITS', () => {
    expect(stepSlots(GROUP_LIMITS.slots.max, 1)).toBe(50);
  });
});

describe('nextLayer', () => {
  const now = new Date('2026-11-12T15:00:00.000Z');
  /** Instante `hours` horas a partir de `now` (negativo = passado), em ISO UTC. */
  const at = (hours: number) => new Date(now.getTime() + hours * 3_600_000).toISOString();

  it('caso 5: reservas e convidados no futuro → próxima é reservas', () => {
    const game = { status: 'open' as const, opensAt: at(-1), reservesOpensAt: at(2), guestsOpensAt: at(5) };
    expect(nextLayer(game, now)).toEqual({ kind: 'reserves', at: game.reservesOpensAt });
  });

  it('caso 6: reservas já abertas, convidados no futuro → próxima é convidados', () => {
    const game = { status: 'open' as const, opensAt: at(-3), reservesOpensAt: at(-1), guestsOpensAt: at(3) };
    expect(nextLayer(game, now)).toEqual({ kind: 'guests', at: game.guestsOpensAt });
  });

  it('caso 7: membros, reservas e convidados abertos → all_open', () => {
    const game = { status: 'open' as const, opensAt: at(-5), reservesOpensAt: at(-3), guestsOpensAt: at(-1) };
    expect(nextLayer(game, now)).toEqual({ kind: 'all_open' });
  });

  it('caso 8: convidados desligados e reservas abertas → nada', () => {
    const game = { status: 'open' as const, opensAt: at(-5), reservesOpensAt: at(-1) };
    expect(nextLayer(game, now)).toBeUndefined();
  });

  it('caso 8: convidados desligados e reservas no futuro → reservas', () => {
    const game = { status: 'open' as const, opensAt: at(-5), reservesOpensAt: at(2) };
    expect(nextLayer(game, now)).toEqual({ kind: 'reserves', at: game.reservesOpensAt });
  });

  it('caso 9: membros ainda fechados (scheduled) → nada', () => {
    const game = {
      status: 'scheduled' as const,
      opensAt: at(1),
      reservesOpensAt: at(2),
      guestsOpensAt: at(5),
    };
    expect(nextLayer(game, now)).toBeUndefined();
  });

  it('caso 10: jogo cancelado com reservas no futuro → nada', () => {
    const game = {
      status: 'cancelled' as const,
      opensAt: at(-1),
      reservesOpensAt: at(2),
      guestsOpensAt: at(5),
    };
    expect(nextLayer(game, now)).toBeUndefined();
  });

  it('caso 10: jogo em andamento com reservas no futuro → nada', () => {
    const game = {
      status: 'in_progress' as const,
      opensAt: at(-1),
      reservesOpensAt: at(2),
      guestsOpensAt: at(5),
    };
    expect(nextLayer(game, now)).toBeUndefined();
  });

  it('caso 11: reservas abrindo exatamente agora contam como abertas', () => {
    const game = { status: 'open' as const, opensAt: at(-1), reservesOpensAt: at(0), guestsOpensAt: at(3) };
    expect(nextLayer(game, now)).toEqual({ kind: 'guests', at: game.guestsOpensAt });
  });

  it('caso 11: convidados abrindo exatamente agora contam como abertos', () => {
    const game = { status: 'open' as const, opensAt: at(-3), reservesOpensAt: at(-1), guestsOpensAt: at(0) };
    expect(nextLayer(game, now)).toEqual({ kind: 'all_open' });
  });
});

// Plano 015, ajuste do espaço vazio (D15).
describe('layerTimeline', () => {
  const now = new Date('2026-11-12T15:00:00.000Z');
  const at = (hours: number) => new Date(now.getTime() + hours * 3_600_000).toISOString();

  it('caso 14: membros abertos, reservas no futuro e convidados desligados', () => {
    const game = { opensAt: at(-2), reservesOpensAt: at(3) };
    expect(layerTimeline(game, now)).toEqual([
      { key: 'members', state: 'open', at: game.opensAt },
      { key: 'reserves', state: 'soon', at: game.reservesOpensAt },
      { key: 'guests', state: 'off' },
    ]);
  });

  it('caso 14: convidados no futuro → soon com o horário', () => {
    const game = { opensAt: at(-2), reservesOpensAt: at(-1), guestsOpensAt: at(4) };
    expect(layerTimeline(game, now)).toEqual([
      { key: 'members', state: 'open', at: game.opensAt },
      { key: 'reserves', state: 'open', at: game.reservesOpensAt },
      { key: 'guests', state: 'soon', at: game.guestsOpensAt },
    ]);
  });

  it('caso 15: camadas que abrem exatamente em now → open', () => {
    const game = { opensAt: at(0), reservesOpensAt: at(0), guestsOpensAt: at(0) };
    expect(layerTimeline(game, now).map((s) => s.state)).toEqual(['open', 'open', 'open']);
  });
});
