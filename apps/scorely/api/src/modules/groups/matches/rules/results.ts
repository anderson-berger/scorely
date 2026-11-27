// Resultado (PAR-31–35), histórico (PAR-36) e "Vale para" (PAR-40).
import { appError } from '@scorely/api/src/lib/errors';
import type { GroupId, UserId } from '@scorely/api/src/lib/ids';
import {
  dynamoCompetitionRepository,
  type StoredCompetition,
} from '@scorely/api/src/modules/groups/competitions/data/competitions.repository';
import {
  competitionRef,
  competitionStatus,
  startsWithin,
} from '@scorely/api/src/modules/groups/competitions/rules/counting';
import type { Participation } from '@scorely/api/src/modules/groups/groups.access';
import type {
  StoredGuest,
  StoredResult,
  StoredResultData,
  StoredTeamPlayer,
} from '@scorely/api/src/modules/groups/matches/data/matches.repository';
import type { MatchContext } from '@scorely/api/src/modules/groups/matches/matches.service';
import { lineup } from '@scorely/api/src/modules/groups/matches/rules/attendance';
import { parseOrFail } from '@scorely/api/src/modules/groups/matches/rules/matches';
import { playerKey, playersPeople, refResolver } from '@scorely/api/src/modules/groups/matches/rules/teams';
import {
  type CompetitionRef,
  dayWinners,
  MATCH_HISTORY_PAGE_SIZE,
  type Match,
  type MatchHistoryItem,
  type MatchHistoryPage,
  type MatchHistoryResult,
  type MatchResult,
  type MatchResultMember,
  type MatchTeamPlayerRef,
  type PublicGroupId,
  resultStandings,
  type SaveMatchResultInput,
  SaveMatchResultInputSchema,
  type SetMatchCompetitionsInput,
  SetMatchCompetitionsInputSchema,
  type User,
} from '@scorely/contracts';

/** PAR-33, 34: todas as pessoas do resultado (repetidas quando jogaram mais de um jogo). */
export function resultPlayers(result: StoredResultData): StoredTeamPlayer[] {
  return result.mode === 'day' ? result.teams.flat() : result.games.flatMap((g) => g.teams.flat());
}

/** PAR-35: o resultado como a página mostra, com a contagem e quem venceu o dia (PAR-33, 34). */
export function resultView(
  result: StoredResult,
  member: (p: StoredTeamPlayer) => MatchResultMember,
): MatchResult {
  const winners = dayWinners(result, playerKey).map(member);
  if (result.mode === 'day') {
    return {
      mode: 'day',
      teams: result.teams.map((team) => team.map(member)),
      winner: result.winner,
      dayWinners: winners,
      version: result.version,
    };
  }
  return {
    mode: 'games',
    games: result.games.map((g) => ({
      teams: [g.teams[0].map(member), g.teams[1].map(member)],
      winner: g.winner,
    })),
    standings: resultStandings(result.games, playerKey).map((s) => ({ ...s, member: member(s.member) })),
    dayWinners: winners,
    version: result.version,
  };
}

/** PAR-36: o resumo do resultado no histórico: pelo dia, o time que venceu; por jogo, quem venceu o dia. */
function historyResult(
  result: StoredResult,
  member: (p: StoredTeamPlayer) => MatchResultMember,
): MatchHistoryResult {
  return result.mode === 'day'
    ? { mode: 'day', winner: result.winner }
    : { mode: 'games', dayWinners: dayWinners(result, playerKey).map(member) };
}

/**
 * PAR-35: uma pessoa do resultado, com o perfil, sem a marca de quem saiu da lista (quem está no resultado jogou). A
 * participação some para quem saiu do grupo. Sem perfil, o convidado que não existe ou o de quem não tem mais
 * perfil: `gone` (PAR-28).
 */
export function resultMember(
  guests: readonly StoredGuest[],
  participants: Map<UserId, Participation>,
  people: Map<UserId, User>,
): (p: StoredTeamPlayer) => MatchResultMember {
  const byId = new Map(guests.map((g) => [g.id, g]));
  return (p) => {
    if (p.kind === 'user') {
      const user = people.get(p.id as UserId);
      const tier = participants.get(p.id as UserId)?.tier;
      return user ? { kind: 'player', user, ...(tier !== undefined && { tier }) } : { kind: 'gone' };
    }
    const guest = byId.get(p.id);
    const by = guest && people.get(guest.requestedBy);
    return guest && by
      ? { kind: 'guest', guestId: guest.id, name: guest.name, requestedBy: by }
      : { kind: 'gone' };
  };
}

export function resultsRules(ctx: MatchContext) {
  const { deps, now } = ctx;
  const competitionRepo = deps.competitions ?? dynamoCompetitionRepository;

  /** PAR-40: as competições destes ids (sem repetir); sem nenhum, nem lê. */
  async function competitionsOf(groupId: GroupId, ids: readonly string[]): Promise<StoredCompetition[]> {
    const unique = [...new Set(ids)];
    return unique.length > 0 ? competitionRepo.getCompetitions(groupId, unique) : [];
  }

  /** PAR-16, 40: o "Vale para" na resposta, na ordem gravada; a que não existe mais some. */
  function refsOf(ids: readonly string[] | undefined, found: readonly StoredCompetition[]): CompetitionRef[] {
    const byId = new Map(found.map((c) => [c.id, c]));
    return (ids ?? []).flatMap((id) => {
      const c = byId.get(id);
      return c ? [competitionRef(c)] : [];
    });
  }

  /**
   * PAR-22, 40: as competições que entram ou saem do "Vale para" existem e não travaram. Com `startsAt` (a partida),
   * as que entram precisam ter o início dela no período.
   */
  async function checkTouched(
    groupId: GroupId,
    before: readonly string[],
    after: readonly string[],
    at: Date,
    startsAt?: string,
  ): Promise<void> {
    const added = after.filter((id) => !before.includes(id));
    const touched = [...added, ...before.filter((id) => !after.includes(id))];
    const found = new Map((await competitionsOf(groupId, touched)).map((c) => [c.id, c]));
    for (const id of touched) {
      const c = found.get(id);
      if (!c) throw appError('COMPETITION_NOT_FOUND');
      if (competitionStatus(c, at) === 'locked') throw appError('COMPETITION_LOCKED');
    }
    if (startsAt === undefined) return;
    for (const id of added) {
      const c = found.get(id);
      if (c && !startsWithin(c, startsAt)) {
        throw appError('MATCH_OUTSIDE_COMPETITION', { competitionId: id });
      }
    }
  }

  /**
   * PAR-31–34: registrar o resultado (troca o anterior inteiro, inclusive o jeito), a partir do início e sem prazo.
   * Entra quem está na lista, dentro ou na fila. Ninguém é avisado.
   */
  async function saveResult(
    userId: UserId,
    publicId: PublicGroupId,
    matchId: string,
    input: SaveMatchResultInput,
  ): Promise<Match> {
    const access = await deps.groups.access(userId, publicId);
    ctx.requireManage(access);
    const match = await ctx.load(access.groupId, matchId);
    const at = now();
    if (match.cancelledAt !== undefined) throw appError('MATCH_CANCELLED');
    if (match.startedAt === undefined) throw appError('MATCH_NOT_STARTED');
    const parsed = parseOrFail(SaveMatchResultInputSchema, input);
    const state = await ctx.stateOf(match, true);
    const allowed = [...state.list.in, ...state.list.queue];
    const people = await ctx.profiles(allowed.flatMap((i) => (i.kind === 'player' ? [i.userId] : [])));
    const resolver = refResolver(allowed, people);
    const refs =
      parsed.mode === 'day'
        ? parsed.teams.flat()
        : parsed.games.flatMap((g) => [...g.teams[0], ...g.teams[1]]);
    const out = resolver.out(refs);
    if (out.length > 0)
      throw appError('MATCH_TEAM_PLAYER_OUT', { players: await ctx.namedOut(out, state.guests) });
    const team = (list: readonly MatchTeamPlayerRef[]) => list.map(resolver.stored);
    const result: StoredResultData =
      parsed.mode === 'day'
        ? { mode: 'day', teams: parsed.teams.map(team), winner: parsed.winner }
        : {
            mode: 'games',
            games: parsed.games.map((g) => ({
              teams: [team(g.teams[0]), team(g.teams[1])],
              winner: g.winner,
            })),
          };
    await deps.matches.saveResult({
      groupId: access.groupId,
      matchId,
      result,
      by: userId,
      at,
      expectedVersion: parsed.expectedVersion,
    });
    return ctx.view(access, userId, match, true);
  }

  /** PAR-36: as partidas que terminaram, da mais recente para a mais antiga, em páginas de 20. */
  async function history(
    userId: UserId,
    publicId: PublicGroupId,
    cursor?: string,
  ): Promise<MatchHistoryPage> {
    const access = await deps.groups.access(userId, publicId);
    const page = await deps.matches.listHistory(access.groupId, now(), {
      limit: MATCH_HISTORY_PAGE_SIZE,
      cursor,
    });
    const participants = await deps.groups.participants(access.groupId);
    const loaded = await Promise.all(
      page.items.map(async (entry) => {
        const [attendances, guests] = await Promise.all([
          deps.matches.listAttendances(access.groupId, entry.match.id),
          deps.matches.listGuests(access.groupId, entry.match.id),
        ]);
        return { ...entry, guests, list: lineup(entry.match, attendances, guests, participants) };
      }),
    );
    // Só quem venceu o dia, por jogo, precisa do perfil.
    const people = await ctx.profiles(
      loaded.flatMap(({ result, guests }) =>
        result?.mode === 'games' ? playersPeople(dayWinners(result, playerKey), guests) : [],
      ),
    );
    const items: MatchHistoryItem[] = loaded.map(({ match, result, guests, list }) => ({
      id: match.id,
      startsAt: match.startsAt,
      endsAt: match.endsAt,
      status: match.cancelledAt !== undefined ? 'cancelled' : 'finished',
      confirmed: list.in.length,
      ...(result !== undefined && {
        result: historyResult(result, resultMember(guests, participants, people)),
      }),
    }));
    return { items, ...(page.nextCursor !== undefined && { nextCursor: page.nextCursor }) };
  }

  /** PAR-40: o "Vale para" da partida, também depois do início e do fim; ninguém é avisado. */
  async function setCompetitions(
    userId: UserId,
    publicId: PublicGroupId,
    matchId: string,
    input: SetMatchCompetitionsInput,
  ): Promise<Match> {
    const access = await deps.groups.access(userId, publicId);
    ctx.requireManage(access);
    const body = parseOrFail(SetMatchCompetitionsInputSchema, input);
    const match = await ctx.load(access.groupId, matchId);
    if (match.cancelledAt !== undefined) throw appError('MATCH_CANCELLED');
    const at = now();
    await ctx.checkTouched(
      access.groupId,
      match.competitionIds ?? [],
      body.competitionIds,
      at,
      match.startsAt,
    );
    await deps.matches.updateMatch(
      { ...match, competitionIds: body.competitionIds },
      body.expectedVersion,
      at,
    );
    return ctx.view(access, userId, await ctx.load(access.groupId, matchId, true), true);
  }

  return { competitionsOf, refsOf, checkTouched, saveResult, history, setCompetitions };
}
