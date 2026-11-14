import {
  ALL_PERMISSIONS,
  COMPETITION_PRESETS,
  type Competition,
  type CompetitionGameDetail,
  type GamePerson,
  type Permission,
  PublicUserIdSchema,
} from '@scorely/contracts';
import { i18n } from '@scorely/web/src/i18n/index';
import {
  canCloseGames,
  draftAttendance,
  gameStateText,
  personParts,
  pointsText,
  resultText,
  showsGameLine,
} from '@scorely/web/src/modules/competition/competition';
import { groupAccess } from '@scorely/web/src/modules/groups/permissions';
import { describe, expect, it } from 'vitest';

// Competição, etapa 2 (`.claude/work/competicao-2.md`, D9): as funções puras do fechar o jogo (CMP-12, 17) e dos
// jogos na aba Competição (CMP-18). Os textos são conferidos em pt-BR.

const OWNER = PublicUserIdSchema.parse('AAAA1111');
const ME = PublicUserIdSchema.parse('BBBB2222');
const P1 = PublicUserIdSchema.parse('CCCC3333');
const P2 = PublicUserIdSchema.parse('DDDD4444');
const P3 = PublicUserIdSchema.parse('EEEE5555');
const EXTRA = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const owner = groupAccess({ ownerId: OWNER, myPermissions: [...ALL_PERMISSIONS] }, OWNER);
const admin = groupAccess({ ownerId: OWNER, myPermissions: [...ALL_PERMISSIONS] }, ME);
const resultsOnly = groupAccess({ ownerId: OWNER, myPermissions: ['results.record'] as Permission[] }, ME);
const seasonsOnly = groupAccess({ ownerId: OWNER, myPermissions: ['seasons.manage'] as Permission[] }, ME);
const plain = groupAccess({ ownerId: OWNER, myPermissions: [] }, ME);

const INACTIVE: Competition = { status: 'inactive', trialAvailable: true };
const ACTIVE: Competition = {
  status: 'active',
  plan: 'trial',
  activeUntil: '2026-12-14T12:00:00.000Z',
  trialAvailable: false,
  rules: COMPETITION_PRESETS.classic,
};
const EXPIRED: Competition = { ...ACTIVE, status: 'expired', activeUntil: '2026-11-13T12:00:00.000Z' };

const STARTS = '2026-11-13T22:00:00.000Z';
const BEFORE = Date.parse('2026-11-13T21:00:00.000Z');
const DURING = Date.parse('2026-11-13T23:30:00.000Z');

function render(text: { key: string; params?: Record<string, string | number> }): string {
  i18n.global.locale.value = 'pt-BR';
  return i18n.global.t(text.key, text.params ?? {});
}
const line = (parts: { key: string; params?: Record<string, string | number> }[]) =>
  parts.map(render).join(' · ');

describe('quem fecha os jogos (CMP-17, CMP-18)', () => {
  it('CMP-18: quem tem results.record (dono, Admin ou só ela) fecha com a competição ativa e o grupo ativo', () => {
    for (const access of [owner, admin, resultsOnly]) expect(canCloseGames(ACTIVE, access, false)).toBe(true);
  });

  it('CMP-18: sem results.record (mesmo com seasons.manage) não fecha', () => {
    expect(canCloseGames(ACTIVE, seasonsOnly, false)).toBe(false);
    expect(canCloseGames(ACTIVE, plain, false)).toBe(false);
  });

  it('CMP-18: com a competição vencida, desativada ou sem leitura, ou com o grupo arquivado, ninguém tem os botões', () => {
    for (const access of [owner, admin, resultsOnly]) {
      expect(canCloseGames(EXPIRED, access, false)).toBe(false);
      expect(canCloseGames(INACTIVE, access, false)).toBe(false);
      expect(canCloseGames(undefined, access, false)).toBe(false);
      expect(canCloseGames(ACTIVE, access, true)).toBe(false);
    }
  });
});

describe('a linha Competição na aba Jogo (CMP-17)', () => {
  const inProgress = { status: 'in_progress' as const, startsAt: STARTS };

  it('CMP-17: com o jogo atual em andamento e a competição ativa, quem tem results.record vê a linha', () => {
    for (const access of [owner, admin, resultsOnly])
      expect(showsGameLine(ACTIVE, access, inProgress, false, DURING)).toBe(true);
  });

  it('CMP-17: o jogo que ainda não começou (agendado ou com a lista aberta) não tem a linha', () => {
    expect(showsGameLine(ACTIVE, owner, { status: 'scheduled', startsAt: STARTS }, false, BEFORE)).toBe(
      false,
    );
    expect(showsGameLine(ACTIVE, owner, { status: 'open', startsAt: STARTS }, false, BEFORE)).toBe(false);
  });

  it('CMP-17: jogo cancelado tem a linha depois do início (para "Fechar como cancelado"), e não antes', () => {
    const cancelled = { status: 'cancelled' as const, startsAt: STARTS };
    expect(showsGameLine(ACTIVE, owner, cancelled, false, DURING)).toBe(true);
    expect(showsGameLine(ACTIVE, owner, cancelled, false, BEFORE)).toBe(false);
  });

  it('CMP-17: sem results.record, sem a competição ativa, com o grupo arquivado ou sem o jogo → sem a linha', () => {
    expect(showsGameLine(ACTIVE, seasonsOnly, inProgress, false, DURING)).toBe(false);
    expect(showsGameLine(ACTIVE, plain, inProgress, false, DURING)).toBe(false);
    expect(showsGameLine(EXPIRED, owner, inProgress, false, DURING)).toBe(false);
    expect(showsGameLine(INACTIVE, owner, inProgress, false, DURING)).toBe(false);
    expect(showsGameLine(undefined, owner, inProgress, false, DURING)).toBe(false);
    expect(showsGameLine(ACTIVE, owner, inProgress, true, DURING)).toBe(false);
    expect(showsGameLine(ACTIVE, owner, null, false, DURING)).toBe(false);
    expect(showsGameLine(ACTIVE, owner, undefined, false, DURING)).toBe(false);
  });
});

describe('os jogos na aba Competição (CMP-18)', () => {
  it('CMP-18: o estado de cada jogo da lista', () => {
    const state = (g: Parameters<typeof gameStateText>[0]) => gameStateText(g);
    expect(state({ state: 'open', cancelled: false, friendly: false })).toMatchObject({
      key: 'competition.games.state.open',
    });
    expect(state({ state: 'closed', cancelled: false, friendly: false })).toMatchObject({
      key: 'competition.games.state.closed',
    });
    expect(state({ state: 'closed', cancelled: false, friendly: true })).toMatchObject({
      key: 'competition.games.state.friendly',
    });
    expect(state({ state: 'cancelled', cancelled: true, friendly: false })).toMatchObject({
      key: 'competition.games.state.cancelled',
    });
    expect(state({ state: 'closed', cancelled: true, friendly: false })).toMatchObject({
      key: 'competition.games.state.closedCancelled',
    });
    expect(render(state({ state: 'open', cancelled: false, friendly: false }))).toBe('para fechar');
  });

  it('CMP-18: o resultado: "Time 2 venceu" (o índice 1), "Empate", "Sem resultado" ou o jogo cancelado', () => {
    expect(resultText({ cancelled: false, winner: 1 })).toEqual({
      key: 'competition.games.result.team',
      params: { n: 2 },
    });
    expect(render(resultText({ cancelled: false, winner: 1 }))).toBe('Time 2 venceu');
    expect(render(resultText({ cancelled: false, winner: 0 }))).toBe('Time 1 venceu');
    expect(resultText({ cancelled: false, winner: 'draw' })).toMatchObject({
      key: 'competition.games.result.draw',
    });
    expect(render(resultText({ cancelled: false, winner: 'draw' }))).toBe('Empate');
    expect(resultText({ cancelled: false })).toMatchObject({ key: 'competition.games.result.none' });
    expect(render(resultText({ cancelled: false }))).toBe('Sem resultado');
    expect(resultText({ cancelled: true })).toMatchObject({ key: 'competition.games.result.cancelled' });
  });

  it('CMP-18: cada pessoa com o que aconteceu: "veio · Time 2", "faltou", "não confirmou"', () => {
    const came: GamePerson = {
      id: P1,
      kind: 'member',
      inside: true,
      attendance: 'present',
      team: 1,
      event: 'win',
      points: 3,
    };
    expect(line(personParts(came))).toBe('veio · Time 2');
    const cameNoTeam: GamePerson = { ...came, team: undefined, event: 'loss', points: 1 };
    expect(line(personParts(cameNoTeam))).toBe('veio');
    const absent: GamePerson = {
      id: P2,
      kind: 'member',
      inside: true,
      attendance: 'absent',
      event: 'noShow',
      points: -2,
    };
    expect(line(personParts(absent))).toBe('faltou');
    const notConfirmed: GamePerson = { id: P3, kind: 'member', event: 'notConfirmed', points: 0 };
    expect(line(personParts(notConfirmed))).toBe('não confirmou');
  });

  it('CMP-18: no jogo cancelado, quem estava dentro aparece como "estava na lista"', () => {
    const inCancelled: GamePerson = { id: P1, kind: 'member', inside: true, event: 'cancelled', points: 0 };
    expect(line(personParts(inCancelled))).toBe('estava na lista');
  });

  it('CMP-18: o avulso mostra o time em que jogou', () => {
    const extra: GamePerson = { id: EXTRA, name: 'Avulso', kind: 'extra', team: 0 };
    expect(personParts(extra).map(render)).toContain('Time 1');
  });

  it('CMP-18: os pontos: "+3", "−2" (com o menos tipográfico) e "0"', () => {
    expect(pointsText(3)).toBe('+3');
    expect(pointsText(10)).toBe('+10');
    expect(pointsText(-2)).toBe('−2');
    expect(pointsText(0)).toBe('0');
  });
});

describe('a chamada no painel de fechar (CMP-12)', () => {
  const people: GamePerson[] = [
    { id: OWNER, kind: 'member', inside: true },
    { id: P1, kind: 'reserve', inside: true },
    { id: P2, kind: 'guest', inside: false },
    { id: P3, kind: 'member' },
    { id: EXTRA, kind: 'extra', team: 0 },
  ];
  const detail = (
    list: GamePerson[],
    cancelled = false,
  ): Pick<CompetitionGameDetail, 'people' | 'cancelled'> => ({
    people: list,
    cancelled,
  });

  it('CMP-12: sem chamada, o rascunho vem com dentro = veio e fila = faltou, só para quem está na lista', () => {
    expect(draftAttendance(detail(people))).toEqual({ [OWNER]: 'present', [P1]: 'present', [P2]: 'absent' });
  });

  it('CMP-12: a chamada que veio (sugerida ou já fechada) fica, e o que falta é completado pela posição', () => {
    const marked: GamePerson[] = [
      { ...people[0], attendance: 'absent' } as GamePerson,
      people[1] as GamePerson,
      { ...people[2], attendance: 'present' } as GamePerson,
      people[3] as GamePerson,
      people[4] as GamePerson,
    ];
    expect(draftAttendance(detail(marked))).toEqual({ [OWNER]: 'absent', [P1]: 'present', [P2]: 'present' });
  });

  it('CMP-12: os avulsos e os membros fora da lista não entram na chamada', () => {
    const draft = draftAttendance(detail(people));
    expect(draft[EXTRA]).toBeUndefined();
    expect(draft[P3]).toBeUndefined();
  });

  it('CMP-12: jogo cancelado não tem chamada', () => {
    expect(draftAttendance(detail(people, true))).toEqual({});
  });
});
