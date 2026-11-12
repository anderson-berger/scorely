import type { Attendee, MyGroup } from '@scorely/contracts';
import { GROUP_LIMITS } from '@scorely/contracts';
import { gameCapacityPatch, stepCapacity } from '@scorely/web/src/modules/groups/capacity';
import { cardLine } from '@scorely/web/src/modules/groups/groups';
import { minimum } from '@scorely/web/src/modules/groups/scoreboard';
import { describe, expect, it } from 'vitest';

// Vagas e mínimo por jogo (GRP-45, 46) no web: placar, frase do card e painel "Vagas deste jogo".

function attendees(n: number): Attendee[] {
  return Array.from({ length: n }, (_, i) => ({
    userId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    name: `Pessoa ${i}`,
    confirmedAt: '2026-11-10T22:00:00.000Z',
    role: 'member',
  }));
}

const HOUR = 3_600_000;
// quarta, 2026-11-11 12:00Z
const now = new Date('2026-11-11T12:00:00.000Z');
const inHours = (h: number) => new Date(now.getTime() + h * HOUR).toISOString();

type CardGroup = Pick<MyGroup, 'myRole' | 'listOpensHoursBefore' | 'reservesOpenHoursBefore' | 'game'>;

const cardGroup = (game: Partial<CardGroup['game']>, myRole: CardGroup['myRole'] = 'member'): CardGroup => ({
  myRole,
  listOpensHoursBefore: 48,
  reservesOpenHoursBefore: 24,
  game: {
    date: '2026-11-12',
    startsAt: inHours(10),
    status: 'open',
    slots: 12,
    confirmedCount: 0,
    ...game,
  },
});

describe('minimum (placar)', () => {
  it('GRP-46: sem mínimo, o placar não mostra nada embaixo', () => {
    expect(minimum({ confirmed: attendees(8) })).toBeUndefined();
  });

  it('GRP-46: mínimo 10 com 8 dentro → faltam 2 para fechar', () => {
    expect(minimum({ confirmed: attendees(8), minPlayers: 10 })).toEqual({
      min: 10,
      missing: 2,
      reached: false,
    });
  });

  it('GRP-46: dentro chega ao mínimo → jogo confirmado', () => {
    expect(minimum({ confirmed: attendees(10), minPlayers: 10 })).toEqual({
      min: 10,
      missing: 0,
      reached: true,
    });
  });

  it('GRP-46: acima do mínimo continua confirmado, sem faltar número negativo', () => {
    expect(minimum({ confirmed: attendees(12), minPlayers: 10 })).toEqual({
      min: 10,
      missing: 0,
      reached: true,
    });
  });

  it('GRP-46: alguém desiste e o número cai abaixo do mínimo → volta a não estar confirmado', () => {
    expect(minimum({ confirmed: attendees(9), minPlayers: 10 })).toEqual({
      min: 10,
      missing: 1,
      reached: false,
    });
  });
});

describe('cardLine com o mínimo (passo 6)', () => {
  it('GRP-28: sem mínimo, a frase continua sendo as vagas que faltam', () => {
    expect(cardLine(cardGroup({ confirmedCount: 8, slots: 12 }), now)).toEqual({ kind: 'spots', count: 4 });
  });

  it('GRP-28: com mínimo e abaixo dele → "faltam N para fechar"', () => {
    const g = cardGroup({ confirmedCount: 7, slots: 12, minPlayers: 10 });
    expect(cardLine(g, now)).toEqual({ kind: 'needs', count: 3 });
  });

  it('GRP-28: com mínimo atingido e ainda com vaga → "jogo confirmado"', () => {
    const g = cardGroup({ confirmedCount: 10, slots: 12, minPlayers: 10 });
    expect(cardLine(g, now)).toEqual({ kind: 'confirmed' });
  });

  it('GRP-28: lotado vem antes do mínimo → lotado', () => {
    const g = cardGroup({ confirmedCount: 12, slots: 12, minPlayers: 10 });
    expect(cardLine(g, now)).toEqual({ kind: 'full' });
  });

  it('GRP-28: "você joga" (passo 3) vem antes do mínimo', () => {
    const g = cardGroup({
      confirmedCount: 5,
      slots: 12,
      minPlayers: 10,
      me: { list: 'confirmed', position: 5 },
    });
    expect(cardLine(g, now)).toEqual({ kind: 'playing', position: 5 });
  });

  it('GRP-28: "abre {data}" (passo 5) vem antes do mínimo', () => {
    const g = cardGroup({ startsAt: inHours(72), status: 'scheduled', confirmedCount: 0, minPlayers: 10 });
    expect(cardLine(g, now).kind).toBe('opens');
  });

  it('GRP-28: cancelado (passo 1) vem antes do mínimo', () => {
    const g = cardGroup({ status: 'cancelled', confirmedCount: 3, minPlayers: 10 });
    expect(cardLine(g, now)).toEqual({ kind: 'cancelled' });
  });
});

describe('stepCapacity (painel de vagas e mínimo)', () => {
  it('GRP-45: um passo para cima ou para baixo nas vagas', () => {
    expect(stepCapacity('slots', 12, 1)).toBe(13);
    expect(stepCapacity('slots', 12, -1)).toBe(11);
  });

  it('GRP-45: as vagas ficam entre 2 e 50', () => {
    expect(stepCapacity('slots', GROUP_LIMITS.slots.min, -1)).toBe(2);
    expect(stepCapacity('slots', GROUP_LIMITS.slots.max, 1)).toBe(50);
  });

  it('GRP-46: o mínimo começa em 2 e não passa de 50 no stepper', () => {
    expect(stepCapacity('minPlayers', 2, -1)).toBe(2);
    expect(stepCapacity('minPlayers', 50, 1)).toBe(50);
    expect(stepCapacity('minPlayers', 10, -1)).toBe(9);
  });
});

describe('gameCapacityPatch (painel "Vagas deste jogo")', () => {
  it('GRP-45: nada mudou → nada a salvar', () => {
    expect(gameCapacityPatch({ slots: 12, minPlayers: 10 }, { slots: 12, minPlayers: 10 })).toEqual({});
  });

  it('GRP-45: só as vagas mudaram → manda só as vagas', () => {
    expect(gameCapacityPatch({ slots: 12, minPlayers: 10 }, { slots: 14, minPlayers: 10 })).toEqual({
      slots: 14,
    });
  });

  it('GRP-46: só o mínimo mudou → manda só o mínimo', () => {
    expect(gameCapacityPatch({ slots: 12, minPlayers: 10 }, { slots: 12, minPlayers: 8 })).toEqual({
      minPlayers: 8,
    });
  });

  it('GRP-46: mínimo tirado do rascunho com o jogo tendo mínimo → null', () => {
    expect(gameCapacityPatch({ slots: 12, minPlayers: 10 }, { slots: 12, minPlayers: undefined })).toEqual({
      minPlayers: null,
    });
  });

  it('GRP-46: jogo sem mínimo e rascunho sem mínimo → não manda o mínimo', () => {
    expect(gameCapacityPatch({ slots: 12 }, { slots: 16, minPlayers: undefined })).toEqual({ slots: 16 });
  });

  it('GRP-45, GRP-46: vagas e mínimo mudaram juntos → manda os dois', () => {
    expect(gameCapacityPatch({ slots: 12 }, { slots: 16, minPlayers: 10 })).toEqual({
      slots: 16,
      minPlayers: 10,
    });
  });
});
