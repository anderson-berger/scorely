import { type CompetitionGameDetail, type Match, PublicUserIdSchema } from '@scorely/contracts';
import { defaultMatchTeams } from '@scorely/web/src/modules/competition/competition';
import { describe, expect, it } from 'vitest';

// Competição, etapa 3 (`.claude/work/competicao-3.md`, D7): a partida nova já vem com os times (CMP-23).
// `defaultMatchTeams(detail)` devolve os dois times da partida nova: os da última partida registrada; na 1ª, o Time 1
// e o Time 2 publicados; sem times publicados, vazia.

const P1 = PublicUserIdSchema.parse('AAAA1111');
const P2 = PublicUserIdSchema.parse('BBBB2222');
const P3 = PublicUserIdSchema.parse('CCCC3333');
const P4 = PublicUserIdSchema.parse('DDDD4444');
const P5 = PublicUserIdSchema.parse('EEEE5555');
const EXTRA = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function detail(extra: Partial<CompetitionGameDetail> = {}): CompetitionGameDetail {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa_2026-11-13',
    date: '2026-11-13',
    startsAt: '2026-11-13T22:00:00.000Z',
    state: 'open',
    cancelled: false,
    friendly: false,
    closed: false,
    unit: 'match',
    teams: [],
    people: [],
    matches: [],
    dayWinners: [],
    version: 0,
    ...extra,
  };
}

const m = (number: number, teams: Match['teams']): Match => ({
  id: `f000000${number}-0000-4000-8000-000000000000`,
  number,
  teams,
  winner: 0,
  version: 1,
});

describe('a partida nova (CMP-23)', () => {
  it('CMP-23: a 1ª partida vem com o Time 1 e o Time 2 publicados, com o avulso', () => {
    expect(
      defaultMatchTeams(
        detail({
          teams: [
            [P1, P2, EXTRA],
            [P3, P4],
          ],
        }),
      ),
    ).toEqual([
      [P1, P2, EXTRA],
      [P3, P4],
    ]);
  });

  it('CMP-23: com mais de dois times publicados, vêm só o Time 1 e o Time 2', () => {
    expect(defaultMatchTeams(detail({ teams: [[P1], [P2], [P3]] }))).toEqual([[P1], [P2]]);
  });

  it('CMP-23: sem times publicados, a 1ª partida vem vazia', () => {
    expect(defaultMatchTeams(detail())).toEqual([[], []]);
  });

  it('CMP-23: a partida nova vem com os times da última partida registrada, não dos publicados', () => {
    const res = defaultMatchTeams(
      detail({
        teams: [
          [P1, P2],
          [P3, P4],
        ],
        matches: [
          m(1, [
            [P1, P2],
            [P3, P4],
          ]),
          m(2, [
            [P1, P5],
            [P3, EXTRA],
          ]),
        ],
      }),
    );
    expect(res).toEqual([
      [P1, P5],
      [P3, EXTRA],
    ]);
  });

  it('CMP-23: os times devolvidos são uma cópia: mexer neles não muda a partida anterior', () => {
    const last = m(1, [[P1], [P2]]);
    const res = defaultMatchTeams(detail({ matches: [last] }));
    res[0].push(P3);
    expect(last.teams).toEqual([[P1], [P2]]);
  });
});
