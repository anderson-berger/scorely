import type { TeamPlayer, Teams } from '@scorely/contracts';
import { i18n } from '@scorely/web/src/i18n/index';
import { teamsLine } from '@scorely/web/src/modules/teams/teams';
import { describe, expect, it } from 'vitest';

// GRP-29: a linha Times da aba Jogo. `teamsLine` devolve a chave do i18n e os parâmetros, ou `null` (sem linha).
// O teste confere o texto em pt-BR, que é o que o doc define.

const GROUP = 'b0000000-0000-4000-8000-000000000001';
const OWNER = 'a0000000-0000-4000-8000-000000000001';
const ANA = 'a0000000-0000-4000-8000-000000000002';
const BIA = 'a0000000-0000-4000-8000-000000000003';
const CAI = 'a0000000-0000-4000-8000-000000000004';
const DUDA = 'a0000000-0000-4000-8000-000000000005';

const player = (userId: string): TeamPlayer => ({
  userId,
  name: userId.slice(-1),
  role: 'member',
  positions: [],
  adjusted: false,
  inList: true,
  bench: false,
  pinned: false,
  extra: false,
});

const teams = (status: Teams['status'], ids: string[][]): Teams => ({
  groupId: GROUP,
  date: '2026-11-13',
  status,
  teams: ids.map((team) => team.map(player)),
  unassigned: [],
});

/** O texto em pt-BR da linha, ou `null` sem linha. */
function text(line: ReturnType<typeof teamsLine>): string | null {
  i18n.global.locale.value = 'pt-BR';
  return line === null ? null : i18n.global.t(line.key, line.params ?? {});
}

const published = teams('published', [
  [ANA, BIA],
  [CAI, OWNER],
]);

describe('linha Times na aba Jogo', () => {
  it('GRP-29: quem está num time publicado → "Você está no Time 2"', () => {
    expect(text(teamsLine(published, CAI, false))).toBe('Você está no Time 2');
  });

  it('GRP-29: o número é o do time da pessoa (Time 1 é o primeiro)', () => {
    expect(text(teamsLine(published, ANA, false))).toBe('Você está no Time 1');
  });

  it('GRP-29: times publicados e a pessoa fora deles → "Times publicados"', () => {
    expect(text(teamsLine(published, DUDA, false))).toBe('Times publicados');
  });

  it('GRP-29: sem times publicados, quem não é dono não vê a linha', () => {
    expect(teamsLine(null, ANA, false)).toBeNull();
  });

  it('GRP-29: dono, sem times → "Times: ainda não montados"', () => {
    expect(text(teamsLine(null, OWNER, true))).toBe('Times: ainda não montados');
  });

  it('GRP-29: dono, com rascunho → "Times: rascunho"', () => {
    const draft = teams('draft', [[ANA], [BIA]]);
    expect(text(teamsLine(draft, OWNER, true))).toBe('Times: rascunho');
  });

  it('GRP-29: dono fora dos times publicados → "Times: publicados"', () => {
    const withoutOwner = teams('published', [[ANA], [BIA]]);
    expect(text(teamsLine(withoutOwner, OWNER, true))).toBe('Times: publicados');
  });

  it('GRP-29: dono dentro de um time publicado continua vendo o estado de dono → "Times: publicados"', () => {
    expect(text(teamsLine(published, OWNER, true))).toBe('Times: publicados');
  });
});
