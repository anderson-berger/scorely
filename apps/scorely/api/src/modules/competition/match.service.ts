import { newEntity } from '@scorely/api/src/lib/entity';
import { appError } from '@scorely/api/src/lib/errors';
import type { UserId } from '@scorely/api/src/lib/ids';
import type { CompetitionRepository } from '@scorely/api/src/modules/competition/competition.repository';
import { competitionStatus } from '@scorely/api/src/modules/competition/competition.status';
import { createGameAccess } from '@scorely/api/src/modules/competition/game.access';
import type { MatchRepository, StoredMatch } from '@scorely/api/src/modules/competition/match.repository';
import { announcePodium, podiumIds } from '@scorely/api/src/modules/competition/ranking.service';
import type {
  ResultRepository,
  StoredGameResult,
} from '@scorely/api/src/modules/competition/result.repository';
import type { SeasonRepository, StoredSeason } from '@scorely/api/src/modules/competition/season.repository';
import { isLocked, seasonOfDate, seasonState } from '@scorely/api/src/modules/competition/seasons';
import type { GameRecord, GameRepository } from '@scorely/api/src/modules/groups/game.repository';
import type { GroupRepository } from '@scorely/api/src/modules/groups/group.repository';
import { requireActive, requirePermission } from '@scorely/api/src/modules/groups/groups.deps';
import type { NotificationService } from '@scorely/api/src/modules/notifications/notification.service';
import type { TeamsRepository } from '@scorely/api/src/modules/teams/teams.repository';
import type { UserDirectory } from '@scorely/api/src/modules/users/user.repository';
import type { CompetitionGameDetail, MatchInput, TeamPersonId } from '@scorely/contracts';

export interface MatchDeps {
  groups: GroupRepository;
  games: GameRepository;
  teams: TeamsRepository;
  competitions: CompetitionRepository;
  results: ResultRepository;
  matches: MatchRepository;
  /** As temporadas (CMP-31, 32). Sem ele, nenhum jogo é de temporada. */
  seasons?: SeasonRepository;
  /** O aviso de quem entrou no pódio da temporada (CMP-38). Sem ele, ninguém é avisado. */
  notifications?: Pick<NotificationService, 'notify'>;
  /** A tradução do id público da entrada (USR-17), pelos ids da lista do jogo. */
  users: Pick<UserDirectory, 'getMany'>;
  now?: () => Date;
  /** O jogo atualizado para a resposta: o `get` do serviço de resultados. */
  detail: (userId: UserId, groupId: string, date: string) => Promise<CompetitionGameDetail>;
}

/** O jogo onde a partida pode ser registrada, já conferido (CMP-19). */
interface MatchGame {
  record: GameRecord;
  result: StoredGameResult | undefined;
  /** A temporada do jogo, se houver (CMP-31, 38). */
  season: StoredSeason | undefined;
  /** Quem pode estar numa partida: os da lista e os avulsos dos times publicados, pelo id da entrada. */
  allowed: Map<string, string>;
  /** O fuso do grupo (o estado da temporada é pelas datas locais). */
  timeZone: string;
}

export function createMatchService(deps: MatchDeps) {
  const now = deps.now ?? (() => new Date());
  const access = createGameAccess({ ...deps, now });

  /**
   * CMP-19: as condições de fechar (CMP-11), na ordem da D6: quem não participa, permissão, arquivado, competição
   * inativa, jogo não encontrado, não começou, cancelado e a unidade (a da cópia, se fechado).
   */
  async function matchGame(userId: UserId, groupId: string, date: string): Promise<MatchGame> {
    const { group } = await requirePermission(deps, userId, groupId, 'results.record');
    requireActive(group);
    const competition = await deps.competitions.get(groupId);
    if (!competition || competitionStatus(competition, now()) !== 'active')
      throw appError('COMPETITION_INACTIVE');
    const occ = access.occurrenceFor(group, competition, date);
    const record = await access.startedGame(group, occ);
    // CMP-32: partidas de um jogo de temporada travada não mudam.
    const season = seasonOfDate(deps.seasons ? await deps.seasons.list(groupId) : [], occ.date);
    if (season && isLocked(season, now(), group.timeZone)) throw appError('SEASON_CLOSED');
    if (record.cancelledAt) throw appError('GAME_CANCELLED');
    const result = await deps.results.get(record.id);
    // CMP-31: a unidade de um jogo ainda não fechado vem da temporada, se houver.
    const unit = result ? result.rules.unit : (season?.rules ?? competition.rules).unit;
    if (unit !== 'match') throw appError('MATCH_INVALID', { reason: 'day_unit' });

    const [list, published] = await Promise.all([
      result?.list ?? access.listOf(group, record),
      access.publishedTeams(groupId, date),
    ]);
    const users = await deps.users.getMany(list.map((e) => e.id as UserId));
    const allowed = new Map<string, string>([
      ...users.map((u): [string, string] => [u.publicId, u.id]),
      // Num jogo fechado, os avulsos do fechamento (os mesmos que o detalhe mostra, CMP-15); senão, os publicados.
      ...(result ? (result.extras ?? []) : published.extras).map((x): [string, string] => [x.id, x.id]),
    ]);
    return { record, result, allowed, season, timeZone: group.timeZone };
  }

  /** CMP-20, 21: os times da entrada viram os ids do sistema, ou a partida é recusada. */
  function teamsOf(game: MatchGame, input: MatchInput): [string[], string[]] {
    if (input.teams[0].length === 0 || input.teams[1].length === 0) {
      throw appError('MATCH_INVALID', { reason: 'team_empty' });
    }
    const all = [...input.teams[0], ...input.teams[1]];
    const unknown = all.find((id) => !game.allowed.has(id));
    if (unknown !== undefined) throw appError('MATCH_INVALID', { reason: 'person_unknown', userId: unknown });
    const repeated = all.find((id, i) => all.indexOf(id) !== i);
    if (repeated !== undefined) {
      throw appError('MATCH_INVALID', { reason: 'person_repeated', userId: repeated as TeamPersonId });
    }
    const system = (side: string[]) => side.map((id) => game.allowed.get(id) ?? id);
    const teams: [string[], string[]] = [system(input.teams[0]), system(input.teams[1])];
    // CMP-21: num jogo fechado, quem foi marcado como "faltou" não está numa partida.
    const attendance = game.result?.attendance;
    if (attendance) {
      const absent = all.find((id) => attendance[game.allowed.get(id) ?? id] === 'absent');
      if (absent !== undefined) {
        throw appError('MATCH_INVALID', { reason: 'person_absent', userId: absent as TeamPersonId });
      }
    }
    return teams;
  }

  /**
   * CMP-38: o pódio de antes, para avisar quem entrar nele. Só num jogo fechado: antes disso, as partidas não pontuam.
   */
  async function podiumBefore(game: MatchGame, groupId: string): Promise<Set<string> | undefined> {
    if (!deps.notifications || !game.season || !game.result) return undefined;
    if (seasonState(game.season, now(), game.timeZone) !== 'open') return undefined;
    return podiumIds(deps, groupId, game.season);
  }

  async function podiumAfter(
    game: MatchGame,
    groupId: string,
    before: Set<string> | undefined,
  ): Promise<void> {
    if (before && game.season) await announcePodium(deps, groupId, game.season, before);
  }

  /** CMP-20: a partida existe e é deste jogo. */
  async function matchOf(game: MatchGame, matchId: string): Promise<StoredMatch> {
    const match = await deps.matches.get(matchId);
    if (!match || match.gameId !== game.record.id) throw appError('MATCH_NOT_FOUND');
    return match;
  }

  return {
    /** CMP-19–21: registra a partida, até 30 por jogo (`GAME_MATCHES_FULL`), e devolve o jogo. */
    async create(
      userId: UserId,
      groupId: string,
      date: string,
      input: MatchInput,
    ): Promise<CompetitionGameDetail> {
      const game = await matchGame(userId, groupId, date);
      const teams = teamsOf(game, input);
      const at = now();
      const before = await podiumBefore(game, groupId);
      const match = newEntity<StoredMatch>(
        { gameId: game.record.id, groupId, teams, winner: input.winner, updatedAt: at.toISOString() },
        at,
      );
      if ((await deps.matches.create(match)) === 'full') throw appError('GAME_MATCHES_FULL');
      await podiumAfter(game, groupId, before);
      return deps.detail(userId, groupId, date);
    },

    /** CMP-20: corrigir troca os times e o resultado de uma vez; o número e o registro continuam. */
    async update(
      userId: UserId,
      groupId: string,
      date: string,
      matchId: string,
      input: MatchInput,
    ): Promise<CompetitionGameDetail> {
      const game = await matchGame(userId, groupId, date);
      await matchOf(game, matchId);
      const teams = teamsOf(game, input);
      const before = await podiumBefore(game, groupId);
      await deps.matches.update(matchId, { teams, winner: input.winner, updatedAt: now().toISOString() });
      await podiumAfter(game, groupId, before);
      return deps.detail(userId, groupId, date);
    },

    /** CMP-20: apagar renumera as seguintes (a ordem sai do registro). */
    async remove(
      userId: UserId,
      groupId: string,
      date: string,
      matchId: string,
    ): Promise<CompetitionGameDetail> {
      const game = await matchGame(userId, groupId, date);
      const match = await matchOf(game, matchId);
      const before = await podiumBefore(game, groupId);
      await deps.matches.delete(match);
      await podiumAfter(game, groupId, before);
      return deps.detail(userId, groupId, date);
    },
  };
}
