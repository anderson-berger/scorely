import type { UserId } from '@scorely/api/src/lib/ids';
import type {
  Access,
  CompetitionContext,
} from '@scorely/api/src/modules/groups/competitions/competitions.service';
import type {
  FinalLine,
  StoredCompetition,
} from '@scorely/api/src/modules/groups/competitions/data/competitions.repository';
import {
  type CountingRules,
  competitionStatus,
} from '@scorely/api/src/modules/groups/competitions/rules/counting';
import { toUser } from '@scorely/api/src/modules/groups/groups.service';
import type {
  StoredResult,
  StoredTeamPlayer,
} from '@scorely/api/src/modules/groups/matches/data/matches.repository';
import type { UserRecord } from '@scorely/api/src/modules/users/users.access';
import {
  type Competition,
  type CompetitionCut,
  type CompetitionRankingRow,
  type CompetitionSummary,
  competitionRanking,
} from '@scorely/contracts';

// Ranking (COM-06–09): as linhas dos recortes, a competição na lista e a competição para quem pede.

const CUTS: readonly CompetitionCut[] = ['all', 'male', 'female'];
const CUT_GENDER = { male: 'M', female: 'F' } as const;

const playerKey = (p: StoredTeamPlayer) => `${p.kind}:${p.id}`;

export function createRankingRules(
  { deps, now, repo, urlOf, canManage }: CompetitionContext,
  { results }: CountingRules,
) {
  /** COM-05, 06, 08, 09: as linhas dos três recortes, pelos membros e gêneros de agora. */
  async function liveCuts(c: StoredCompetition, list: readonly StoredResult[]) {
    const participants = await deps.groups.participants(c.groupId);
    const members = [...participants.entries()].flatMap(([id, { tier }]) => (tier === 'member' ? [id] : []));
    const records = members.length > 0 ? await deps.users.getMany(members) : [];
    const gender = new Map(records.map((r) => [r.id as string, r.gender]));
    const cut = (which: CompetitionCut): FinalLine[] =>
      competitionRanking(list, c.points, playerKey, (p) => {
        if (p.kind !== 'user' || participants.get(p.id as UserId)?.tier !== 'member') return false;
        return which === 'all' || gender.get(p.id) === CUT_GENDER[which];
      }).map(({ member, winRate: _w, ...line }) => ({ ...line, userId: member.id as UserId }));
    return Object.fromEntries(CUTS.map((which) => [which, cut(which)])) as Record<
      CompetitionCut,
      FinalLine[]
    >;
  }

  /** As linhas de agora (aberta ou no prazo) ou as guardadas (travada), e se algum resultado soma (COM-04). */
  async function standings(c: StoredCompetition) {
    if (c.lockedAt !== undefined) {
      const final = await repo.getFinal(c.groupId, c.id);
      return { cuts: final?.cuts ?? { all: [], male: [], female: [] }, hasResults: true };
    }
    const list = await results(c);
    return { cuts: await liveCuts(c, list), hasResults: list.length > 0 };
  }

  async function profiles(lines: readonly FinalLine[]): Promise<Map<string, UserRecord>> {
    const ids = [...new Set(lines.map((l) => l.userId))];
    const records = ids.length > 0 ? await deps.users.getMany(ids) : [];
    return new Map(records.map((r) => [r.id as string, r]));
  }

  /** COM-08: a linha com o perfil; quem não tem mais perfil sai da lista. */
  function rowsOf(lines: readonly FinalLine[], people: Map<string, UserRecord>): CompetitionRankingRow[] {
    return lines.flatMap((line) => {
      const record = people.get(line.userId);
      if (!record) return [];
      const { userId: _u, ...rest } = line;
      return [
        { ...rest, user: toUser(record, urlOf), winRate: line.played > 0 ? line.wins / line.played : 0 },
      ];
    });
  }

  /** COM-07: a competição na lista, com os 3 primeiros do geral e o lugar de quem pede. */
  function summaryOf(
    c: StoredCompetition,
    all: readonly FinalLine[],
    people: Map<string, UserRecord>,
    userId: UserId,
    at: Date,
  ): CompetitionSummary {
    const mine = all.find((l) => l.userId === userId);
    return {
      id: c.id,
      ...(c.name !== undefined && { name: c.name }),
      number: c.number,
      type: c.type,
      startDate: c.startDate,
      endDate: c.endDate,
      timeZone: c.timeZone,
      status: competitionStatus(c, at),
      podium: rowsOf(all, people).slice(0, 3),
      ...(mine !== undefined && { myPosition: mine.position }),
    };
  }

  /** COM-08: a competição para quem pede, no recorte. */
  async function view(
    ctx: Access,
    userId: UserId,
    c: StoredCompetition,
    cut: CompetitionCut,
  ): Promise<Competition> {
    const at = now();
    const { cuts, hasResults } = await standings(c);
    const people = await profiles([...cuts.all, ...cuts[cut]]);
    const status = competitionStatus(c, at);
    const manage = canManage(ctx) && status !== 'locked';
    return {
      ...summaryOf(c, cuts.all, people, userId, at),
      points: c.points,
      version: c.version,
      ...(c.lockedAt !== undefined && { lockedAt: c.lockedAt }),
      // COM-04, 11: os pontos só mudam aberta e sem resultado (no prazo, só o nome).
      actions: { manage, editPoints: manage && status === 'open' && !hasResults },
      cut,
      ranking: rowsOf(cuts[cut], people),
    };
  }

  return { liveCuts, standings, profiles, summaryOf, view };
}

export type RankingRules = ReturnType<typeof createRankingRules>;
