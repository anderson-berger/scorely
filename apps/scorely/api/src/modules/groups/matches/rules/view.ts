// Ver (PAR-15, 16): a lista das partidas e a partida para quem pede.
import type { UserId } from '@scorely/api/src/lib/ids';
import type {
  StoredMatch,
  StoredSeries,
} from '@scorely/api/src/modules/groups/matches/data/matches.repository';
import type { Access, MatchContext } from '@scorely/api/src/modules/groups/matches/matches.service';
import {
  type Lineup,
  type LineupItem,
  lineup,
  myAttendanceOf,
} from '@scorely/api/src/modules/groups/matches/rules/attendance';
import { guestStatus } from '@scorely/api/src/modules/groups/matches/rules/guests';
import {
  currentWave,
  naturalTimes,
  rank,
  shownTime,
  TIER_WAVE,
} from '@scorely/api/src/modules/groups/matches/rules/matches';
import {
  resultMember,
  resultPlayers,
  resultView,
} from '@scorely/api/src/modules/groups/matches/rules/results';
import { seriesView } from '@scorely/api/src/modules/groups/matches/rules/series';
import { lineupView, playersPeople, teamPeople } from '@scorely/api/src/modules/groups/matches/rules/teams';
import type {
  GroupTier,
  Match,
  MatchEntry,
  MatchStatus,
  MatchSummary,
  MatchWaves,
  PublicGroupId,
} from '@scorely/contracts';

/** PAR-16: as horas das ondas, já com a hora em que cada uma abriu antes da hora configurada. */
function wavesView(match: StoredMatch): MatchWaves {
  const guests = shownTime(match, 'guests');
  return {
    members: (shownTime(match, 'members') as Date).toISOString(),
    reserves: (shownTime(match, 'reserves') as Date).toISOString(),
    ...(guests !== undefined && { guests: guests.toISOString() }),
    close: naturalTimes(match).close.toISOString(),
  };
}

/** PAR-16: a situação. Iniciar e finalizar são à mão (PAR-41, 43); antes de iniciar, vem da hora. */
function statusOf(match: StoredMatch, now: Date): MatchStatus {
  if (match.cancelledAt !== undefined) return 'cancelled';
  if (match.finishedAt !== undefined) return 'finished';
  if (match.startedAt !== undefined) return 'in_progress';
  if (now >= naturalTimes(match).close) return 'closed';
  return currentWave(match, now) === undefined ? 'scheduled' : 'open';
}

function summaryOf(
  match: StoredMatch,
  list: Lineup,
  userId: UserId,
  at: Date,
  series?: StoredSeries,
): MatchSummary {
  const wave = currentWave(match, at);
  const mine = myAttendanceOf(list, userId);
  const activeSeries = series !== undefined && series.endedAt === undefined ? series : undefined;
  return {
    id: match.id,
    startsAt: match.startsAt,
    endsAt: match.endsAt,
    ...(match.teams !== undefined && { teams: match.teams }),
    ...(match.playersPerTeam !== undefined && { playersPerTeam: match.playersPerTeam }),
    status: statusOf(match, at),
    ...(wave !== undefined && { wave }),
    confirmed: list.in.length,
    ...(mine !== undefined && { myAttendance: mine }),
    ...(activeSeries !== undefined && { seriesWeekday: activeSeries.weekday }),
  };
}

export function viewRules(ctx: MatchContext) {
  const { deps, now } = ctx;

  /** PAR-16: a partida para quem pede. */
  async function view(
    access: Access,
    userId: UserId,
    match: StoredMatch,
    consistent = false,
  ): Promise<Match> {
    const [state, series, saved, result] = await Promise.all([
      ctx.stateOf(match, consistent),
      match.seriesId === undefined
        ? undefined
        : deps.matches.getSeries(match.groupId, match.seriesId, { consistent }),
      deps.matches.getTeams(match.groupId, match.id, { consistent }),
      deps.matches.getResult(match.groupId, match.id, { consistent }),
    ]);
    const tagged = await ctx.competitionsOf(match.groupId, [
      ...(match.competitionIds ?? []),
      ...(series?.competitionIds ?? []),
    ]);
    const at = now();
    const manage = ctx.canManage(access);
    const live = match.cancelledAt === undefined && match.startedAt === undefined;
    const open = live && at < naturalTimes(match).close;
    const wave = currentWave(match, at);
    const requests = state.guests.filter(
      (g) => guestStatus(g) === 'pending' && (manage || g.requestedBy === userId),
    );
    const people = await ctx.profiles([
      ...[...state.list.in, ...state.list.queue].flatMap((i) =>
        i.kind === 'player' ? [i.userId] : [i.guest.requestedBy],
      ),
      ...state.list.notGoing.map((a) => a.userId),
      ...requests.map((g) => g.requestedBy),
      ...teamPeople(saved, state.guests),
      ...(result ? playersPeople(resultPlayers(result), state.guests) : []),
    ]);
    const entry = (item: LineupItem): MatchEntry =>
      item.kind === 'player'
        ? { kind: 'player', user: ctx.profileOf(people, item.userId), tier: item.tier }
        : {
            kind: 'guest',
            guestId: item.guest.id,
            name: item.guest.name,
            requestedBy: ctx.profileOf(people, item.guest.requestedBy),
            removable: live && (manage || item.guest.requestedBy === userId),
          };
    return {
      ...summaryOf(match, state.list, userId, at, series),
      createdAt: match.createdAt,
      version: match.version,
      ...(match.membersHours !== undefined && { membersHours: match.membersHours }),
      ...(match.reservesHours !== undefined && { reservesHours: match.reservesHours }),
      ...(match.guestsHours !== undefined && { guestsHours: match.guestsHours }),
      noGuests: match.noGuests,
      closeHours: match.closeHours,
      resultMode: match.resultMode,
      waves: wavesView(match),
      ...(match.cancelledAt !== undefined && { cancelledAt: match.cancelledAt }),
      ...(match.startedAt !== undefined && { startedAt: match.startedAt }),
      ...(match.finishedAt !== undefined && { finishedAt: match.finishedAt }),
      in: state.list.in.map(entry),
      queue: state.list.queue.map(entry),
      notGoing: state.list.notGoing.map((a) => ({
        user: ctx.profileOf(people, a.userId),
        tier: state.participants.get(a.userId)?.tier as GroupTier,
      })),
      guestRequests: requests.map((g) => ({
        id: g.id,
        name: g.name,
        requestedBy: ctx.profileOf(people, g.requestedBy),
        createdAt: g.createdAt,
        decidable: manage && open && wave === 'guests',
        cancellable: live && g.requestedBy === userId,
      })),
      actions: {
        going: open && rank(wave) >= rank(TIER_WAVE[access.tier]),
        notGoing: live,
        requestGuest: open && wave === 'guests',
        manage: manage && live,
        manageTeams: manage && match.cancelledAt === undefined && match.finishedAt === undefined,
        recordResult: manage && match.cancelledAt === undefined && match.startedAt !== undefined,
        manageCompetitions: manage && match.cancelledAt === undefined,
        start: manage && live,
        unstart:
          manage && match.startedAt !== undefined && match.finishedAt === undefined && result === undefined,
        finish: manage && match.startedAt !== undefined && match.finishedAt === undefined,
      },
      competitions: ctx.refsOf(match.competitionIds, tagged),
      ...(series !== undefined && { series: seriesView(series, ctx.refsOf(series.competitionIds, tagged)) }),
      ...(saved !== undefined && { lineup: lineupView(saved, state, people, entry) }),
      ...(result !== undefined && {
        result: resultView(result, resultMember(state.guests, state.participants, people)),
      }),
    };
  }

  /** PAR-15: as que não terminaram, canceladas incluídas, pelo início. */
  async function list(userId: UserId, publicId: PublicGroupId): Promise<MatchSummary[]> {
    const access = await deps.groups.access(userId, publicId);
    const at = now();
    const [matches, allSeries] = await Promise.all([
      deps.matches.listMatches(access.groupId, at),
      deps.matches.listSeries(access.groupId),
    ]);
    const series = new Map(allSeries.map((x) => [x.id, x]));
    const participants = await deps.groups.participants(access.groupId);
    const summaries = await Promise.all(
      matches.map(async (match) => {
        const [attendances, guests] = await Promise.all([
          deps.matches.listAttendances(match.groupId, match.id),
          deps.matches.listGuests(match.groupId, match.id),
        ]);
        const from = match.seriesId === undefined ? undefined : series.get(match.seriesId);
        return summaryOf(match, lineup(match, attendances, guests, participants), userId, at, from);
      }),
    );
    return summaries.sort((a, b) =>
      a.startsAt === b.startsAt ? (a.id < b.id ? -1 : 1) : a.startsAt < b.startsAt ? -1 : 1,
    );
  }

  /** PAR-16. */
  async function get(userId: UserId, publicId: PublicGroupId, matchId: string): Promise<Match> {
    const access = await deps.groups.access(userId, publicId);
    const match = await ctx.load(access.groupId, matchId);
    return view(access, userId, match);
  }

  return { view, list, get };
}
