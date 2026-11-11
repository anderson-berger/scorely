import type { Attendee, Game } from '@scorely/contracts';
import { describe, expect, it } from 'vitest';
import { countdown, formatCountdown, initials, lineupSlots, score, statusTone } from './scoreboard';

function attendees(n: number): Attendee[] {
  return Array.from({ length: n }, (_, i) => ({
    userId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    name: `Pessoa ${i}`,
    confirmedAt: '2026-11-04T22:00:00.000Z',
    role: 'member',
  }));
}

function game(
  confirmed: number,
  waiting: number,
  slots: number,
): Pick<Game, 'confirmed' | 'waitlist' | 'slots'> {
  return { confirmed: attendees(confirmed), waitlist: attendees(waiting), slots };
}

describe('score', () => {
  it('caso 1: 12 vagas, 12 confirmados e 2 na fila → cheio', () => {
    expect(score(game(12, 2, 12))).toEqual({ confirmed: 12, slots: 12, waiting: 2, full: true });
  });

  it('caso 1: 9 confirmados e fila vazia → não cheio', () => {
    expect(score(game(9, 0, 12))).toEqual({ confirmed: 9, slots: 12, waiting: 0, full: false });
  });
});

describe('statusTone', () => {
  it('caso 2: open e in_progress → accent', () => {
    expect(statusTone('open')).toBe('accent');
    expect(statusTone('in_progress')).toBe('accent');
  });

  it('caso 2: scheduled → neutral', () => {
    expect(statusTone('scheduled')).toBe('neutral');
  });

  it('caso 2: cancelled → danger', () => {
    expect(statusTone('cancelled')).toBe('danger');
  });
});

describe('countdown', () => {
  const now = new Date('2026-11-07T12:00:00.000Z');

  it('caso 3: 1 dia, 4 h, 27 min e 40 s → segundos descartados', () => {
    const at = new Date(now.getTime() + (((1 * 24 + 4) * 60 + 27) * 60 + 40) * 1000).toISOString();
    expect(countdown(now, at)).toEqual({ days: 1, hours: 4, minutes: 27 });
  });

  it('caso 3: horário já passado → zeros, nunca negativo', () => {
    expect(countdown(now, '2026-11-06T09:30:00.000Z')).toEqual({ days: 0, hours: 0, minutes: 0 });
  });
});

describe('initials', () => {
  it('caso 4: "Ana Souza" → "AS"', () => {
    expect(initials('Ana Souza')).toBe('AS');
  });

  it('caso 4: "Rafa Oliveira Lima" → "RL" (primeiro e último nome)', () => {
    expect(initials('Rafa Oliveira Lima')).toBe('RL');
  });

  it('caso 4: "Rafa" → "R"', () => {
    expect(initials('Rafa')).toBe('R');
  });

  it('caso 4: só espaços → "?"', () => {
    expect(initials('  ')).toBe('?');
    expect(initials('')).toBe('?');
  });

  it('caso 4: "íris campos" → "ÍC" (maiúscula com acento)', () => {
    expect(initials('íris campos')).toBe('ÍC');
  });
});

// Plano 015 (D8).
describe('formatCountdown', () => {
  it('caso 1: com dias → "1d 22h 45min"', () => {
    expect(formatCountdown({ days: 1, hours: 22, minutes: 45 })).toBe('1d 22h 45min');
  });

  it('caso 2: sem dias → "22h 45min"', () => {
    expect(formatCountdown({ days: 0, hours: 22, minutes: 45 })).toBe('22h 45min');
  });

  it('caso 2: sem dias e sem horas → "45min"', () => {
    expect(formatCountdown({ days: 0, hours: 0, minutes: 45 })).toBe('45min');
  });

  it('caso 2: tudo zero → "0min"', () => {
    expect(formatCountdown({ days: 0, hours: 0, minutes: 0 })).toBe('0min');
  });

  it('caso 3: dias sem horas → "2d 0h 5min" (com dias, as horas sempre aparecem)', () => {
    expect(formatCountdown({ days: 2, hours: 0, minutes: 5 })).toBe('2d 0h 5min');
  });
});

// Plano 015, ajuste do espaço vazio (D14).
describe('lineupSlots', () => {
  const people = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
  const positions = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

  it('caso 10: sem ninguém e 12 vagas → 12 linhas livres, posições 1–12', () => {
    const { rows, hiddenFree } = lineupSlots<string>([], 12);
    expect(rows.map((r) => r.position)).toEqual(positions(12));
    expect(rows.every((r) => r.person === undefined)).toBe(true);
    expect(hiddenFree).toBe(0);
  });

  it('caso 11: 3 pessoas e 12 vagas → 1–3 com as pessoas na ordem, 4–12 livres', () => {
    const { rows, hiddenFree } = lineupSlots(people(3), 12);
    expect(rows.map((r) => r.position)).toEqual(positions(12));
    expect(rows.slice(0, 3)).toEqual([
      { position: 1, person: 'p1' },
      { position: 2, person: 'p2' },
      { position: 3, person: 'p3' },
    ]);
    expect(rows.slice(3).every((r) => r.person === undefined)).toBe(true);
    expect(hiddenFree).toBe(0);
  });

  it('caso 12: 2 pessoas e 30 vagas → 14 linhas (2 + 12 livres) e hiddenFree 16', () => {
    const { rows, hiddenFree } = lineupSlots(people(2), 30);
    expect(rows.map((r) => r.position)).toEqual(positions(14));
    expect(rows.slice(0, 2).map((r) => r.person)).toEqual(['p1', 'p2']);
    expect(rows.slice(2).every((r) => r.person === undefined)).toBe(true);
    expect(hiddenFree).toBe(16);
  });

  it('caso 13: 12 pessoas e 12 vagas → 12 linhas preenchidas, hiddenFree 0', () => {
    const { rows, hiddenFree } = lineupSlots(people(12), 12);
    expect(rows.map((r) => r.position)).toEqual(positions(12));
    expect(rows.map((r) => r.person)).toEqual(people(12));
    expect(hiddenFree).toBe(0);
  });

  it('caso 13: mais pessoas que vagas (dado antigo) → uma linha por pessoa, sem livres', () => {
    const { rows, hiddenFree } = lineupSlots(people(14), 12);
    expect(rows.map((r) => r.position)).toEqual(positions(14));
    expect(rows.map((r) => r.person)).toEqual(people(14));
    expect(hiddenFree).toBe(0);
  });
});
