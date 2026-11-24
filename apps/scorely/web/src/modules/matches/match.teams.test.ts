import type { MatchLineup, MatchTeamPlayerRef, PublicUserId, User } from '@scorely/contracts';
import {
  draftFromLineup,
  drawTeams,
  moveToTeam,
  refKey,
  resizeTeams,
  suggestedTeamCount,
  type TeamsDraft,
  withoutPlayers,
} from '@scorely/web/src/modules/matches/match.teams';
import { describe, expect, it } from 'vitest';

// PAR-26 (sorteio) e a parte pura da tela de dividir (PAR-28, 30).

const u = (id: string): MatchTeamPlayerRef => ({ kind: 'user', id: id as PublicUserId });
const g = (id: string): MatchTeamPlayerRef => ({ kind: 'guest', id });
const players = (n: number) => Array.from({ length: n }, (_, i) => u(`P${i}`));
const keys = (refs: readonly MatchTeamPlayerRef[]) => refs.map(refKey);
const everyone = (d: TeamsDraft) => [...d.teams.flat(), ...d.unassigned];
const seeded = (values: number[]) => {
  const state = { i: 0 };
  return () => {
    const v = values[state.i % values.length] ?? 0;
    state.i += 1;
    return v;
  };
};

describe('PAR-26: sorteio', () => {
  it('PAR-26: refKey identifica pessoa por tipo e id', () => {
    expect(refKey(u('A'))).toBe('user:A');
    expect(refKey(g('x'))).toBe('guest:x');
  });

  it('PAR-26: o número sugerido é o do formato, ou 2 sem formato ou com 1 time', () => {
    expect(suggestedTeamCount(3)).toBe(3);
    expect(suggestedTeamCount(2)).toBe(2);
    expect(suggestedTeamCount(undefined)).toBe(2);
    expect(suggestedTeamCount(1)).toBe(2);
  });

  it('PAR-26: todos aparecem uma vez só, no número de times pedido, sem ninguém sem time', () => {
    const all = [...players(9), g('g1'), g('g2')];
    const d = drawTeams(all, 3, seeded([0.1, 0.9, 0.5, 0.3]));
    expect(d.teams).toHaveLength(3);
    expect(d.unassigned).toEqual([]);
    expect(keys(everyone(d)).sort()).toEqual(keys(all).sort());
  });

  it('PAR-26: os tamanhos dos times diferem no máximo 1 (11 em 2 → 6 e 5)', () => {
    const d = drawTeams(players(11), 2, seeded([0.7, 0.2, 0.4]));
    expect(d.teams.map((t) => t.length).sort()).toEqual([5, 6]);
    const d3 = drawTeams(players(10), 3, seeded([0.7, 0.2, 0.4]));
    expect(d3.teams.map((t) => t.length).sort()).toEqual([3, 3, 4]);
  });

  it('PAR-26: randoms diferentes dão ordens diferentes', () => {
    const all = players(12);
    const a = drawTeams(all, 2, seeded([0.05, 0.15, 0.25, 0.35]));
    const b = drawTeams(all, 2, seeded([0.95, 0.85, 0.75, 0.65]));
    expect(keys(a.teams.flat())).not.toEqual(keys(b.teams.flat()));
  });

  it('PAR-26: sem ninguém, os times saem vazios; não muta a entrada', () => {
    expect(drawTeams([], 2).teams).toEqual([[], []]);
    const all = players(5);
    const copy = [...all];
    drawTeams(all, 2, seeded([0.3]));
    expect(all).toEqual(copy);
  });
});

describe('PAR-28, 30: a tela com times salvos', () => {
  const user = (nickname: string, id: string): User => ({
    id: id as PublicUserId,
    createdAt: '2026-01-01T00:00:00.000Z',
    nickname,
  });
  const lineup: MatchLineup = {
    list: [
      [
        { kind: 'player', user: user('Edu', 'E1'), tier: 'member', left: false },
        { kind: 'player', user: user('Bia', 'B1'), tier: 'member', left: true },
      ],
      [
        { kind: 'guest', guestId: 'g1', name: 'Joao', requestedBy: user('Edu', 'E1'), left: false },
        { kind: 'guest', guestId: 'g2', name: 'Zeca', requestedBy: user('Edu', 'E1'), left: true },
        { kind: 'gone', left: true },
      ],
    ],
    unassigned: [
      { kind: 'player', user: user('Caio', 'C1'), tier: 'reserve' },
      { kind: 'guest', guestId: 'g3', name: 'Lia', requestedBy: user('Edu', 'E1'), removable: false },
    ] as MatchLineup['unassigned'],
    version: 3,
  };

  it('PAR-28: draftFromLineup tira quem saiu e põe quem está sem time à parte', () => {
    const d = draftFromLineup(lineup);
    expect(d.teams).toEqual([[u('E1')], [g('g1')]]);
    expect(d.unassigned).toEqual([u('C1'), g('g3')]);
  });

  it('PAR-30: resizeTeams para mais cria times vazios no fim e não sorteia', () => {
    const d = resizeTeams({ teams: [[u('A')], [u('B')]], unassigned: [] }, 4);
    expect(d).toEqual({ teams: [[u('A')], [u('B')], [], []], unassigned: [] });
  });

  it('PAR-30: resizeTeams para menos manda quem estava nos times que somem para o fim de Sem time', () => {
    const d = resizeTeams({ teams: [[u('A')], [u('B')], [u('C'), u('D')]], unassigned: [u('X')] }, 2);
    expect(d.teams).toEqual([[u('A')], [u('B')]]);
    expect(d.unassigned).toEqual([u('X'), u('C'), u('D')]);
  });

  it('PAR-30: moveToTeam muda a pessoa para o fim do time escolhido, ou para Sem time', () => {
    const start: TeamsDraft = { teams: [[u('A'), u('B')], [u('C')]], unassigned: [u('X')] };
    expect(moveToTeam(start, u('A'), 1)).toEqual({
      teams: [[u('B')], [u('C'), u('A')]],
      unassigned: [u('X')],
    });
    expect(moveToTeam(start, u('B'), null)).toEqual({
      teams: [[u('A')], [u('C')]],
      unassigned: [u('X'), u('B')],
    });
    expect(moveToTeam(start, u('X'), 0)).toEqual({
      teams: [[u('A'), u('B'), u('X')], [u('C')]],
      unassigned: [],
    });
  });

  it('PAR-30: withoutPlayers tira quem saiu de onde estiver e mantém o resto como estava', () => {
    const start: TeamsDraft = { teams: [[u('A'), u('B')], [u('C')]], unassigned: [u('X'), u('Y')] };
    expect(withoutPlayers(start, [u('B'), u('Y')])).toEqual({
      teams: [[u('A')], [u('C')]],
      unassigned: [u('X')],
    });
  });

  it('PAR-30: as funções não mutam a entrada', () => {
    const start: TeamsDraft = { teams: [[u('A'), u('B')], [u('C')]], unassigned: [u('X')] };
    const snapshot = structuredClone(start);
    moveToTeam(start, u('A'), 1);
    resizeTeams(start, 1);
    withoutPlayers(start, [u('A')]);
    expect(start).toEqual(snapshot);
  });
});
