import { appError } from '@scorely/api/src/lib/errors';
import type { UserId } from '@scorely/api/src/lib/ids';
import { type Occurrence, occurrencesBetween } from '@scorely/api/src/lib/zoned';
import type {
  CompetitionRepository,
  StoredCompetition,
} from '@scorely/api/src/modules/competition/competition.repository';
import { competitionStatus } from '@scorely/api/src/modules/competition/competition.status';
import {
  createGameAccess,
  type ListEntry,
  scheduleOf,
} from '@scorely/api/src/modules/competition/game.access';
import type { MatchRepository, StoredMatch } from '@scorely/api/src/modules/competition/match.repository';
import { announcePodium, podiumIds } from '@scorely/api/src/modules/competition/ranking.service';
import type {
  ResultRepository,
  StoredGameResult,
} from '@scorely/api/src/modules/competition/result.repository';
import { dayWinners, gamePoints, type MemberScore } from '@scorely/api/src/modules/competition/scoring';
import type { SeasonRepository, StoredSeason } from '@scorely/api/src/modules/competition/season.repository';
import { isLocked, seasonOfDate, seasonState } from '@scorely/api/src/modules/competition/seasons';
import type { GameRecord, GameRepository } from '@scorely/api/src/modules/groups/game.repository';
import type { GroupRepository, StoredGroup } from '@scorely/api/src/modules/groups/group.repository';
import {
  permissionsOf,
  requireActive,
  requireMember,
  requirePermission,
} from '@scorely/api/src/modules/groups/groups.deps';
import type { NotificationService } from '@scorely/api/src/modules/notifications/notification.service';
import type { TeamsRepository } from '@scorely/api/src/modules/teams/teams.repository';
import type { UserDirectory } from '@scorely/api/src/modules/users/user.repository';
import type {
  AttendanceMark,
  CloseGameInput,
  CompetitionGame,
  CompetitionGameDetail,
  CompetitionGameState,
  GamePerson,
  GamePersonKind,
  PublicUserId,
  TeamPersonId,
} from '@scorely/contracts';

export interface ResultDeps {
  groups: GroupRepository;
  games: GameRepository;
  teams: TeamsRepository;
  competitions: CompetitionRepository;
  results: ResultRepository;
  /** O id público e o nome de quem aparece no jogo (USR-16). */
  users: Pick<UserDirectory, 'getMany'>;
  /** As partidas do jogo (CMP-19–22). Sem ele, nenhum jogo tem partidas. */
  matches?: MatchRepository;
  /** As temporadas (CMP-31, 32). Sem ele, nenhum jogo é de temporada. */
  seasons?: SeasonRepository;
  /** O aviso de quem entrou no pódio da temporada (CMP-38). Sem ele, ninguém é avisado. */
  notifications?: Pick<NotificationService, 'notify'>;
  now?: () => Date;
}

/** Os papéis no grupo: os do 1º fechamento, ou os de agora para um jogo ainda não fechado. */
interface Roles {
  members: string[];
  reserves: string[];
}

export function createResultService(deps: ResultDeps) {
  const now = deps.now ?? (() => new Date());
  const { occurrenceFor, startedGame, listOf, publishedTeams } = createGameAccess({ ...deps, now });

  /** CMP-29: a temporada do dia do jogo, se houver. */
  async function seasonFor(groupId: string, date: string): Promise<StoredSeason | undefined> {
    return seasonOfDate(deps.seasons ? await deps.seasons.list(groupId) : [], date);
  }

  /** As partidas do jogo, na ordem (CMP-20). */
  async function matchesOf(gameId: string): Promise<StoredMatch[]> {
    return deps.matches ? deps.matches.list(gameId) : [];
  }

  async function currentRoles(groupId: string): Promise<Roles> {
    const list = await deps.groups.listMembers(groupId);
    return {
      members: list.filter((m) => m.role === 'member').map((m) => m.userId),
      reserves: list.filter((m) => m.role === 'reserve').map((m) => m.userId),
    };
  }

  /** CMP-12: a chamada traz todos da lista, pelo id público; traduz para o id do sistema ou recusa. */
  async function attendanceOf(
    list: ListEntry[],
    input: CloseGameInput,
  ): Promise<Record<string, AttendanceMark>> {
    const users = await deps.users.getMany(list.map((e) => e.id as UserId));
    const publicOf = new Map<string, PublicUserId>(users.map((u) => [u.id, u.publicId]));
    const systemOf = new Map<string, string>(users.map((u) => [u.publicId, u.id]));
    const missing = list.find((e) => {
      const shown = publicOf.get(e.id);
      return shown === undefined || !Object.hasOwn(input.attendance, shown);
    });
    if (missing) {
      // Pessoa sem perfil (não acontece na prática): o erro sai sem o id, para nunca vazar o id do sistema (USR-16).
      const shown = publicOf.get(missing.id);
      throw appError('RESULT_INVALID', {
        reason: 'attendance_missing',
        ...(shown !== undefined && { userId: shown }),
      });
    }
    const unknown = Object.keys(input.attendance).find((key) => !systemOf.has(key));
    if (unknown !== undefined)
      throw appError('RESULT_INVALID', { reason: 'attendance_unknown', userId: unknown as TeamPersonId });
    return Object.fromEntries(
      Object.entries(input.attendance).map(([key, mark]) => [systemOf.get(key) ?? key, mark]),
    );
  }

  /** CMP-21: quem jogou uma partida veio: marcar "faltou" para ele recusa o fechamento. */
  async function checkPlayed(gameId: string, attendance: Record<string, AttendanceMark>): Promise<void> {
    const matches = await matchesOf(gameId);
    const played = new Set(matches.flatMap((m) => [...m.teams[0], ...m.teams[1]]));
    const absent = [...played].find((id) => attendance[id] === 'absent');
    if (absent === undefined) return;
    const [user] = await deps.users.getMany([absent as UserId]);
    throw appError('RESULT_INVALID', {
      reason: 'absent_played',
      ...(user && { userId: user.publicId }),
    });
  }

  /** CMP-12, 13: o que o fechamento pode ter. */
  function checkResult(input: CloseGameInput, cancelled: boolean, unit: string, teams: string[][]): void {
    if (cancelled) {
      if (Object.keys(input.attendance).length > 0 || input.winner !== undefined) {
        throw appError('RESULT_INVALID', { reason: 'cancelled_with_result' });
      }
      return;
    }
    if (input.winner === undefined) return;
    if (unit === 'match') throw appError('RESULT_INVALID', { reason: 'winner_with_match_unit' });
    if (teams.length === 0) throw appError('RESULT_INVALID', { reason: 'winner_without_teams' });
    if (typeof input.winner === 'number' && input.winner >= teams.length) {
      throw appError('RESULT_INVALID', { reason: 'winner_out_of_range' });
    }
  }

  /** CMP-12–16: o jogo para quem vê. Fechado, com a chamada, o resultado e os pontos; senão, a lista e os times. */
  async function detail(args: {
    group: StoredGroup;
    occ: Occurrence;
    record: GameRecord;
    competition: StoredCompetition;
    result: StoredGameResult | undefined;
    canRecord: boolean;
    /** A temporada do jogo: a unidade de um jogo ainda não fechado vem dela (CMP-31). */
    season?: StoredSeason | undefined;
  }): Promise<CompetitionGameDetail> {
    const { group, occ, record, competition, result, canRecord, season } = args;
    const list = result?.list ?? (await listOf(group, record));
    const matches = await matchesOf(record.id);
    const played = new Set(matches.flatMap((m) => [...m.teams[0], ...m.teams[1]]));
    const published = result ? undefined : await publishedTeams(group.id, occ.date);
    const teams = result ? result.teams : (published?.teams ?? []);
    const extras = result ? (result.extras ?? []) : (published?.extras ?? []);
    const roles: Roles = result
      ? { members: result.members, reserves: result.reserves ?? [] }
      : await currentRoles(group.id);
    const cancelled = result ? result.cancelled : Boolean(record.cancelledAt);
    const scores: Record<string, MemberScore> = result
      ? gamePoints(
          {
            cancelled: result.cancelled,
            friendly: result.friendly,
            members: result.members,
            list,
            attendance: result.attendance,
            teams: result.teams,
            winner: result.winner,
            unit: result.rules.unit,
            matches,
          },
          result.rules,
        )
      : {};

    const members = new Set(roles.members);
    const reserves = new Set(roles.reserves);
    const listIds = new Set(list.map((e) => e.id));
    const extraIds = new Set(extras.map((x) => x.id));
    const ordered: string[] = [
      ...list.filter((e) => members.has(e.id)).map((e) => e.id),
      ...(result ? roles.members.filter((id) => !listIds.has(id)) : []),
      ...list.filter((e) => !members.has(e.id)).map((e) => e.id),
      ...extras.map((x) => x.id).filter((id) => !listIds.has(id)),
    ];
    const userIds = [...new Set([...ordered, ...teams.flat()].filter((id) => !extraIds.has(id)))] as UserId[];
    const users = await deps.users.getMany(userIds);
    const byId = new Map(users.map((u) => [u.id as string, u]));
    const shown = (id: string): string => byId.get(id)?.publicId ?? id;
    const entryOf = new Map(list.map((e) => [e.id, e]));

    const kindOf = (id: string): GamePersonKind => {
      if (extraIds.has(id)) return 'extra';
      if (members.has(id)) return 'member';
      return reserves.has(id) ? 'reserve' : 'guest';
    };
    const attendanceFor = (entry: ListEntry | undefined): AttendanceMark | undefined => {
      if (!entry || cancelled) return undefined;
      if (result) return result.attendance[entry.id];
      if (!canRecord) return undefined;
      return entry.inside || played.has(entry.id) ? 'present' : 'absent';
    };

    const people: GamePerson[] = ordered.map((id) => {
      const entry = entryOf.get(id);
      const team = teams.findIndex((t) => t.includes(id));
      // USR-04: o apelido; do avulso, o nome digitado (TIM-24). Sem perfil, o id mostrado.
      const nickname =
        (extraIds.has(id) ? extras.find((x) => x.id === id)?.name : byId.get(id)?.nickname) ?? shown(id);
      const attendance = attendanceFor(entry);
      const score = scores[id];
      return {
        id: shown(id),
        nickname,
        kind: kindOf(id),
        ...(entry && { inside: entry.inside }),
        ...(attendance && { attendance }),
        ...(team >= 0 && { team }),
        ...(score && { event: score.event, points: score.points }),
        ...(score?.record && { record: score.record }),
      };
    });

    const state: CompetitionGameState = result ? 'closed' : cancelled ? 'cancelled' : 'open';
    return {
      date: occ.date,
      startsAt: occ.startsAt,
      state,
      cancelled,
      friendly: result?.friendly ?? false,
      closed: Boolean(result),
      unit: result ? result.rules.unit : (season?.rules ?? competition.rules).unit,
      teams: teams.map((t) => t.map(shown)),
      ...(result?.winner !== undefined && { winner: result.winner }),
      people,
      matches: matches.map((m, i) => ({
        id: m.id,
        number: i + 1,
        teams: [m.teams[0].map(shown), m.teams[1].map(shown)] as [string[], string[]],
        winner: m.winner,
      })),
      dayWinners: dayWinners(matches).map(shown),
    };
  }

  return {
    /** CMP-16: os jogos desde a ativação que viraram item, do mais recente ao mais antigo. */
    async list(userId: UserId, groupId: string): Promise<CompetitionGame[]> {
      const { group } = await requireMember(deps, userId, groupId);
      const competition = await deps.competitions.get(groupId);
      if (!competition) return [];
      const occs = occurrencesBetween(scheduleOf(group), new Date(competition.trialStartedAt), now());
      const [records, results] = await Promise.all([
        Promise.all(occs.map((o) => deps.games.findByDate(groupId, o.date))),
        deps.results.listByGroup(groupId),
      ]);
      const byGame = new Map(results.map((r) => [r.gameId, r]));
      return occs.flatMap((occ, i): CompetitionGame[] => {
        const record = records[i];
        if (!record) return [];
        const result = byGame.get(record.id);
        const cancelled = result ? result.cancelled : Boolean(record.cancelledAt);
        const state: CompetitionGameState = result ? 'closed' : cancelled ? 'cancelled' : 'open';
        return [
          { date: occ.date, startsAt: occ.startsAt, state, cancelled, friendly: result?.friendly ?? false },
        ];
      });
    },

    /** CMP-12–16: membros e reservas veem o jogo, inclusive com a competição vencida e o grupo arquivado. */
    async get(userId: UserId, groupId: string, date: string): Promise<CompetitionGameDetail> {
      const { group, staffRoleId } = await requireMember(deps, userId, groupId);
      const competition = await deps.competitions.get(groupId);
      const occ = occurrenceFor(group, competition, date);
      const record = await startedGame(group, occ);
      const result = await deps.results.get(record.id);
      const season = await seasonFor(groupId, occ.date);
      const canRecord = permissionsOf(group, userId, staffRoleId).includes('results.record');
      return detail({
        group,
        occ,
        record,
        competition: competition as StoredCompetition,
        result,
        canRecord,
        season,
      });
    },

    /**
     * CMP-11–15: fecha (1ª vez) ou corrige. Ordem dos erros (D8): quem não participa, permissão, arquivado,
     * competição inativa, jogo não encontrado, não começou e o fechamento inválido.
     */
    async close(
      userId: UserId,
      groupId: string,
      date: string,
      input: CloseGameInput,
    ): Promise<CompetitionGameDetail> {
      const { group } = await requirePermission(deps, userId, groupId, 'results.record');
      requireActive(group);
      const competition = await deps.competitions.get(groupId);
      if (!competition || competitionStatus(competition, now()) !== 'active')
        throw appError('COMPETITION_INACTIVE');
      const occ = occurrenceFor(group, competition, date);
      const record = await startedGame(group, occ);
      // CMP-32: o jogo de uma temporada travada não fecha nem é corrigido.
      const season = await seasonFor(groupId, occ.date);
      if (season && isLocked(season, now(), group.timeZone)) throw appError('SEASON_CLOSED');
      const cancelled = Boolean(record.cancelledAt);
      const [current, published, existing] = await Promise.all([
        listOf(group, record),
        publishedTeams(groupId, date),
        deps.results.get(record.id),
      ]);
      // CMP-14: a lista (dentro ou fila) é a do 1º fechamento; mudar as vagas padrão depois não muda o jogo.
      const list = existing?.list ?? current;
      // CMP-31: dentro de uma temporada, a cópia é a dela.
      const rules = existing?.rules ?? season?.rules ?? competition.rules;
      checkResult(input, cancelled, rules.unit, published.teams);
      const attendance = cancelled ? {} : await attendanceOf(list, input);
      if (!cancelled) await checkPlayed(record.id, attendance);
      // CMP-38: o pódio de antes, para avisar quem entrar nele.
      const podiumBefore =
        deps.notifications && season && seasonState(season, now(), group.timeZone) === 'open'
          ? await podiumIds(deps, groupId, season)
          : undefined;
      const at = now().toISOString();
      const patch = {
        attendance,
        teams: cancelled ? [] : published.teams,
        extras: cancelled ? [] : published.extras,
        ...(input.winner !== undefined && { winner: input.winner }),
        friendly: input.friendly ?? false,
        updatedAt: at,
      };

      const created =
        !existing &&
        (await deps.results.create({
          gameId: record.id,
          groupId,
          date: occ.date,
          startsAt: occ.startsAt,
          cancelled,
          rules,
          ...(season && { seasonId: season.id }),
          ...(await currentRoles(groupId)),
          list,
          ...patch,
          createdAt: at,
        }));
      // Já existia (ou outro aparelho fechou antes): é uma correção, com a cópia e os membros do 1º fechamento.
      if (!created) await deps.results.update(record.id, { ...patch, winner: input.winner });

      if (podiumBefore && season) await announcePodium(deps, groupId, season, podiumBefore);
      // Releitura consistente: o fechamento acabou de ser gravado.
      const result = await deps.results.get(record.id, { consistent: true });
      return detail({ group, occ, record, competition, result, canRecord: true, season });
    },
  };
}
