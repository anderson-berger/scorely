// O service das partidas (ADR 0021): monta o contexto que os assuntos usam e junta os de `rules/`.
import { appError } from '@scorely/api/src/lib/errors';
import type { GroupId, UserId } from '@scorely/api/src/lib/ids';
import type {
  CompetitionRepository,
  StoredCompetition,
} from '@scorely/api/src/modules/groups/competitions/data/competitions.repository';
import type { GroupAccess, Participation } from '@scorely/api/src/modules/groups/groups.access';
import { toUser, type UrlOf } from '@scorely/api/src/modules/groups/groups.service';
import type {
  AgendaEntry,
  MatchRepository,
  NextMatch,
  StoredAttendance,
  StoredGuest,
  StoredMatch,
} from '@scorely/api/src/modules/groups/matches/data/matches.repository';
import {
  attendanceRules,
  currentAnswers,
  type Lineup,
  lineup,
} from '@scorely/api/src/modules/groups/matches/rules/attendance';
import { guestsRules } from '@scorely/api/src/modules/groups/matches/rules/guests';
import { MANAGE, matchesRules } from '@scorely/api/src/modules/groups/matches/rules/matches';
import { resultsRules } from '@scorely/api/src/modules/groups/matches/rules/results';
import { seriesRules } from '@scorely/api/src/modules/groups/matches/rules/series';
import { teamsRules } from '@scorely/api/src/modules/groups/matches/rules/teams';
import { viewRules } from '@scorely/api/src/modules/groups/matches/rules/view';
import { type MediaService, mediaService } from '@scorely/api/src/modules/media/media.service';
import type { NotificationService } from '@scorely/api/src/modules/notifications/notifications.service';
import type { UserDirectory } from '@scorely/api/src/modules/users/users.access';
import type { CompetitionRef, Match, MatchTeamPlayerOut, MatchTeamPlayerRef, User } from '@scorely/contracts';

export { guestStatus, normalizeGuestName } from '@scorely/api/src/modules/groups/matches/rules/guests';

export interface MatchesDeps {
  matches: MatchRepository;
  /** Participação, tier e permissão (GRV-15, 17): o grupo não sabe nada das partidas. */
  groups: GroupAccess;
  /** `resolve`: o nome de quem saiu da lista em `MATCH_TEAM_PLAYER_OUT` (PAR-25). */
  users: Pick<UserDirectory, 'getMany' | 'resolve'>;
  /** Os avisos `match_promoted` (PAR-09), `match_cancelled` (PAR-07), `match_guest_requested` (PAR-12), `match_list_open` (PAR-24) e `match_teams_ready` (PAR-29). */
  notifications: { notify(...args: Parameters<NotificationService['notify']>): Promise<unknown> };
  /** MID-12: só o `urlOf` da mídia. Sem ele, a mídia de produção. */
  media?: Pick<MediaService, 'urlOf'>;
  /** O "Vale para" (PAR-40): as competições do grupo, só lidas. Sem ele, o repositório de produção. */
  competitions?: Pick<CompetitionRepository, 'getCompetitions'>;
  now?: () => Date;
}

export type Access = Awaited<ReturnType<GroupAccess['access']>>;

/** O que o aviso precisa do grupo: o id público (o link) e o nome. A rotina tira da agenda; a requisição, do acesso. */
export type GroupInfo = Pick<Access, 'groupId' | 'publicId' | 'name'>;

/** Respostas que contam, convidados, participantes e a lista calculada (PAR-09, 10). */
export interface MatchState {
  attendances: StoredAttendance[];
  guests: StoredGuest[];
  participants: Map<UserId, Participation>;
  list: Lineup;
}

/** O que mais de um assunto usa. Cada assunto recebe o mesmo contexto. */
export interface MatchContext {
  deps: MatchesDeps;
  now: () => Date;
  canManage(access: Access): boolean;
  requireManage(access: Access): void;
  /** Partida que ainda aceita mudança: não cancelada (PAR-07) e não iniciada (PAR-06, 08, 14, 41). */
  requireLive(match: StoredMatch): void;
  load(groupId: GroupId, matchId: string, consistent?: boolean): Promise<StoredMatch>;
  stateOf(match: StoredMatch, consistent?: boolean): Promise<MatchState>;
  lineup: typeof lineup;
  profiles(ids: readonly UserId[]): Promise<Map<UserId, User>>;
  profileOf(map: Map<UserId, User>, id: UserId): User;
  linkOf(info: Pick<GroupInfo, 'publicId'>, matchId: string): string;
  view(access: Access, userId: UserId, match: StoredMatch, consistent?: boolean): Promise<Match>;
  competitionsOf(groupId: GroupId, ids: readonly string[]): Promise<StoredCompetition[]>;
  refsOf(ids: readonly string[] | undefined, found: readonly StoredCompetition[]): CompetitionRef[];
  checkTouched(
    groupId: GroupId,
    before: readonly string[],
    after: readonly string[],
    at: Date,
    startsAt?: string,
  ): Promise<void>;
  notifyPromoted(
    access: Access,
    match: StoredMatch,
    before: Lineup,
    after: Lineup,
    skip?: UserId,
  ): Promise<void>;
  checkListOpen(match: StoredMatch, info: GroupInfo, at: Date): Promise<void>;
  agendaFor(match: StoredMatch, info: GroupInfo, after: Date): AgendaEntry[];
  nextOf(match: StoredMatch, info: GroupInfo, at: Date): Promise<NextMatch | undefined>;
  afterNext(next: NextMatch | undefined, info: GroupInfo, at: Date): Promise<void>;
  namedOut(out: readonly MatchTeamPlayerRef[], guests: readonly StoredGuest[]): Promise<MatchTeamPlayerOut[]>;
}

export function createMatchService(deps: MatchesDeps) {
  const now = deps.now ?? (() => new Date());
  const urlOf: UrlOf = (purpose, mediaId) =>
    deps.media ? deps.media.urlOf(purpose, mediaId) : mediaService.urlOf(purpose, mediaId);

  const canManage = (access: Access) => access.permissions.includes(MANAGE);

  async function load(groupId: GroupId, matchId: string, consistent = false): Promise<StoredMatch> {
    const match = await deps.matches.getMatch(groupId, matchId, { consistent });
    if (!match) throw appError('MATCH_NOT_FOUND');
    return match;
  }

  /** Respostas, convidados e participantes de uma vez. */
  async function stateOf(match: StoredMatch, consistent = false): Promise<MatchState> {
    const [attendances, guests, participants] = await Promise.all([
      deps.matches.listAttendances(match.groupId, match.id, { consistent }),
      deps.matches.listGuests(match.groupId, match.id, { consistent }),
      deps.groups.participants(match.groupId),
    ]);
    // PAR-10: só as respostas que contam (a de antes da volta não é dele).
    return {
      attendances: currentAnswers(attendances, participants),
      guests,
      participants,
      list: lineup(match, attendances, guests, participants),
    };
  }

  async function profiles(ids: readonly UserId[]): Promise<Map<UserId, User>> {
    const unique = [...new Set(ids)];
    const records = unique.length > 0 ? await deps.users.getMany(unique) : [];
    return new Map(records.map((r) => [r.id, toUser(r, urlOf)]));
  }

  function profileOf(map: Map<UserId, User>, id: UserId): User {
    const user = map.get(id);
    if (!user) throw new Error('Match person without a user profile');
    return user;
  }

  // Os assuntos se chamam pelo contexto; cada função só é chamada depois que todos foram montados.
  const ctx: MatchContext = {
    deps,
    now,
    canManage,
    requireManage(access) {
      if (!canManage(access)) throw appError('GROUP_PERMISSION_DENIED', { permission: MANAGE });
    },
    requireLive(match) {
      if (match.cancelledAt !== undefined) throw appError('MATCH_CANCELLED');
      if (match.startedAt !== undefined) throw appError('MATCH_STARTED');
    },
    load,
    stateOf,
    lineup,
    profiles,
    profileOf,
    linkOf: (info, matchId) => `/groups/${info.publicId}/matches/${matchId}`,
    view: (...args) => views.view(...args),
    competitionsOf: (...args) => results.competitionsOf(...args),
    refsOf: (...args) => results.refsOf(...args),
    checkTouched: (...args) => results.checkTouched(...args),
    notifyPromoted: (...args) => attendance.notifyPromoted(...args),
    checkListOpen: (...args) => attendance.checkListOpen(...args),
    agendaFor: (...args) => attendance.agendaFor(...args),
    nextOf: (...args) => series.nextOf(...args),
    afterNext: (...args) => series.afterNext(...args),
    namedOut: (...args) => teams.namedOut(...args),
  };

  const matches = matchesRules(ctx);
  const views = viewRules(ctx);
  const attendance = attendanceRules(ctx);
  const guests = guestsRules(ctx);
  const series = seriesRules(ctx);
  const teams = teamsRules(ctx);
  const results = resultsRules(ctx);

  return {
    create: matches.create,
    list: views.list,
    updateSeries: series.updateSeries,
    endSeries: series.endSeries,
    setCompetitions: results.setCompetitions,
    runAgenda: attendance.runAgenda,
    get: views.get,
    update: matches.update,
    advance: matches.advance,
    cancel: matches.cancel,
    start: matches.start,
    unstart: matches.unstart,
    finish: matches.finish,
    setAttendance: attendance.setAttendance,
    requestGuest: guests.requestGuest,
    approveGuest: guests.approveGuest,
    declineGuest: guests.declineGuest,
    removeGuest: guests.removeGuest,
    saveTeams: teams.saveTeams,
    saveResult: results.saveResult,
    history: results.history,
  };
}

export type MatchService = ReturnType<typeof createMatchService>;
