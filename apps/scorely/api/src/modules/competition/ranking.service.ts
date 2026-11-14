import { randomUUID } from 'node:crypto';
import { appError } from '@scorely/api/src/lib/errors';
import type { UserId } from '@scorely/api/src/lib/ids';
import { highlightsOf, trophiesOf } from '@scorely/api/src/modules/competition/awards';
import type { CompetitionRepository } from '@scorely/api/src/modules/competition/competition.repository';
import type { MatchRepository } from '@scorely/api/src/modules/competition/match.repository';
import {
  memberStats,
  positionsOf,
  type RankingEntry,
  rankingRows,
  type ScoredGame,
} from '@scorely/api/src/modules/competition/ranking';
import type {
  ResultRepository,
  StoredGameResult,
} from '@scorely/api/src/modules/competition/result.repository';
import { gamePoints } from '@scorely/api/src/modules/competition/scoring';
import type {
  SeasonRepository,
  StoredFinal,
  StoredSeason,
} from '@scorely/api/src/modules/competition/season.repository';
import { seasonState } from '@scorely/api/src/modules/competition/seasons';
import type { StoredTrophy, TrophyRepository } from '@scorely/api/src/modules/competition/trophy.repository';
import { trophyViews } from '@scorely/api/src/modules/competition/trophy.service';
import type { GroupRepository, StoredGroup } from '@scorely/api/src/modules/groups/group.repository';
import { requireMember } from '@scorely/api/src/modules/groups/groups.deps';
import type { NotificationService } from '@scorely/api/src/modules/notifications/notification.service';
import type { UserDirectory } from '@scorely/api/src/modules/users/user.repository';
import type { Gender, PersonGame, PersonHistory, PublicUserId, Ranking, Tiebreak } from '@scorely/contracts';

export interface RankingDeps {
  groups: GroupRepository;
  competitions: CompetitionRepository;
  results: ResultRepository;
  matches: MatchRepository;
  /** O nome, o gênero e o id público (USR-16); a tradução do id da rota (USR-17). */
  users: Pick<UserDirectory, 'getMany' | 'resolve'>;
  /** As temporadas (CMP-33). Sem ele, não há ranking de temporada. */
  seasons?: SeasonRepository;
  /** Os avisos de fim de temporada e de troféu (CMP-38). Sem ele, ninguém é avisado. */
  notifications?: Pick<NotificationService, 'notify'>;
  /** Os troféus da pessoa no histórico (CMP-37). Sem ele, o histórico vem sem troféus. */
  trophies?: TrophyRepository;
  now?: () => Date;
}

/** Um fechamento já pontuado, com o que o histórico precisa além do `ScoredGame`. */
interface Scored extends ScoredGame {
  result: StoredGameResult;
}

export function createRankingService(deps: RankingDeps) {
  const now = deps.now ?? (() => new Date());

  async function scoredGames(groupId: string): Promise<Scored[]> {
    return scoreGames(deps, groupId);
  }

  /** As linhas com o id público, o apelido (USR-04) e o gênero de agora, no recorte (o ranking final usa os mesmos). */
  async function publicRows(
    entries: readonly RankingEntry[],
    tiebreak: readonly Tiebreak[],
    gender?: Gender,
  ) {
    const users = await deps.users.getMany(entries.map((e) => e.id as UserId));
    const byId = new Map(users.map((u) => [u.id as string, u]));
    const inCut = entries.filter((e) => byId.has(e.id) && (!gender || byId.get(e.id)?.gender === gender));
    return positionsOf(inCut, tiebreak).flatMap((row) => {
      const user = byId.get(row.id);
      if (!user) return [];
      return [
        {
          userId: user.publicId,
          nickname: user.nickname,
          ...(user.gender !== undefined && { gender: user.gender }),
          position: row.position,
          points: row.points,
          attendance: row.attendance,
          streak: row.streak,
          record: row.record,
        },
      ];
    });
  }

  /** CMP-24, 25: o ranking dos membros de agora, sobre os jogos dados. */
  async function liveEntries(groupId: string, games: readonly Scored[], tiebreak: readonly Tiebreak[]) {
    const roster = await deps.groups.listMembers(groupId);
    const members = roster.filter((m) => m.role === 'member').map((m) => m.userId);
    return rankingRows(games, members, tiebreak);
  }

  /** CMP-33: os jogos da temporada (pela data). */
  function inSeason(games: readonly Scored[], season: StoredSeason): Scored[] {
    return games.filter((g) => g.result.date >= season.startDate && g.result.date <= season.endDate);
  }

  /**
   * CMP-32: o ranking final da temporada travada. Já guardado, é ele; senão, calcula com os membros de agora, guarda (o
   * primeiro vale) e devolve o que ficou no banco.
   */
  async function finalOf(groupId: string, season: StoredSeason): Promise<StoredFinal> {
    if (season.final) return season.final;
    const games = inSeason(await scoredGames(groupId), season);
    const rows = await liveEntries(groupId, games, season.rules.tiebreak);
    const at = now().toISOString();
    const final: StoredFinal = { rows, games: games.length, savedAt: at, token: randomUUID() };
    // CMP-36: os troféus vão na mesma transação do ranking final.
    const trophies: StoredTrophy[] = trophiesOf(final).map((t) => ({
      seasonId: season.id,
      userId: t.userId,
      kind: t.kind,
      groupId,
      awardedAt: at,
    }));
    await seasonsRepo().saveFinal(season.id, final, trophies);
    const saved = (await seasonsRepo().get(season.id))?.final ?? final;
    // CMP-39: só quem gravou avisa, então ninguém recebe duas vezes.
    if (saved.token === final.token) await announce(groupId, season, saved);
    return saved;
  }

  /** CMP-38: "temporada encerrada" para cada pessoa do final, e "troféu" para cada destaque (texto em pt-BR, NTF-03). */
  async function announce(groupId: string, season: StoredSeason, final: StoredFinal): Promise<void> {
    const notifications = deps.notifications;
    if (!notifications) return;
    // CMP-36: a temporada sem nenhum jogo fechado não entrega nada, nem o aviso (todos empatariam em 1º).
    if (final.games === 0) return;
    const name = season.name ?? `Temporada ${season.number}`;
    const link = `/groups/${groupId}/competition`;
    for (const row of final.rows) {
      const body = row.position === 1 ? 'Você foi campeão!' : `Você ficou em ${row.position}º.`;
      await notifications.notify(row.id as UserId, {
        type: 'season_closed',
        title: `${name} terminou`,
        body,
        link,
      });
    }
    const titles = {
      attendance: `Você foi o mais presente de ${name}`,
      streak: `Você teve a maior sequência de ${name}`,
    } as const;
    for (const h of highlightsOf(final)) {
      for (const id of h.ids) {
        await notifications.notify(id as UserId, {
          type: 'trophy_awarded',
          title: titles[h.kind],
          link: '/profile',
        });
      }
    }
  }

  async function seasonOf(groupId: string, seasonId: string): Promise<StoredSeason> {
    const season = deps.seasons ? await deps.seasons.get(seasonId) : undefined;
    if (!season || season.groupId !== groupId) throw appError('SEASON_NOT_FOUND');
    return season;
  }

  function seasonsRepo(): SeasonRepository {
    if (!deps.seasons) throw new Error('Season repository not configured');
    return deps.seasons;
  }

  return {
    /** CMP-24–26: os membros de agora, pelo recorte do perfil, com o desempate do regulamento de agora. */
    async ranking(userId: UserId, groupId: string, gender?: Gender, seasonId?: string): Promise<Ranking> {
      const { group } = await requireMember(deps, userId, groupId);
      if (seasonId !== undefined) {
        // CMP-33: o ranking da temporada, com os jogos e o desempate dela; travada, o final guardado.
        const season = await seasonOf(groupId, seasonId);
        const state = seasonState(season, now(), group.timeZone);
        const head = { id: season.id, ...(season.name !== undefined && { name: season.name }), state };
        if (state === 'closed') {
          const final = await finalOf(groupId, season);
          const rows = await publicRows(final.rows, season.rules.tiebreak, gender);
          return { rows, games: final.games, season: head, final: true };
        }
        const games = inSeason(await scoredGames(groupId), season);
        const entries = await liveEntries(groupId, games, season.rules.tiebreak);
        const rows = await publicRows(entries, season.rules.tiebreak, gender);
        return { rows, games: games.length, season: head, final: false };
      }
      const competition = await deps.competitions.get(groupId);
      if (!competition) return { rows: [], games: 0 };
      const games = await scoredGames(groupId);
      const entries = await liveEntries(groupId, games, competition.rules.tiebreak);
      return { rows: await publicRows(entries, competition.rules.tiebreak, gender), games: games.length };
    },

    /** CMP-33, 34: o pódio da temporada travada (as posições 1 a 3, com os empatados), para a lista das temporadas. */
    async podium(group: StoredGroup, season: StoredSeason) {
      const final = await finalOf(group.id, season);
      return (await publicRows(final.rows, season.rules.tiebreak)).filter((r) => r.position <= 3);
    },

    /** CMP-36: os destaques da temporada travada, com quem levou (empate = todos). */
    async highlights(group: StoredGroup, season: StoredSeason) {
      const final = await finalOf(group.id, season);
      const rows = await publicRows(final.rows, season.rules.tiebreak);
      const byPublic = new Map(final.rows.map((r) => [r.id, r]));
      const users = await deps.users.getMany(final.rows.map((r) => r.id as UserId));
      const publicOf = new Map(users.map((u) => [u.id as string, u.publicId as string]));
      return highlightsOf(final).map((h) => ({
        kind: h.kind,
        rows: rows.filter((r) => h.ids.some((id) => publicOf.get(id) === r.userId && byPublic.has(id))),
      }));
    },

    /**
     * CMP-27: os jogos fechados em que a pessoa estava na lista ou era membro, do mais recente ao mais antigo, com o
     * total no topo. Quem nunca esteve no grupo: GROUP_MEMBER_NOT_FOUND.
     */
    async person(userId: UserId, groupId: string, publicUserId: PublicUserId): Promise<PersonHistory> {
      await requireMember(deps, userId, groupId);
      const resolved = await deps.users.resolve([publicUserId]);
      const id = resolved.get(publicUserId);
      if (!id) throw appError('GROUP_MEMBER_NOT_FOUND');
      const [games, roster] = await Promise.all([scoredGames(groupId), deps.groups.listMembers(groupId)]);
      const mine = games.filter(
        (g) => g.members.includes(id) || (g.result.list ?? []).some((e) => e.id === id),
      );
      if (mine.length === 0 && !roster.some((m) => m.userId === id)) throw appError('GROUP_MEMBER_NOT_FOUND');

      const [user] = await deps.users.getMany([id]);
      const stats = memberStats(games, id);
      const history: PersonGame[] = [...mine].reverse().map((g) => {
        const member = g.members.includes(id);
        const score = member ? g.scores[id] : undefined;
        const mark = g.attendance[id];
        const team = g.result.teams.findIndex((t) => t.includes(id));
        return {
          date: g.result.date,
          startsAt: g.startsAt,
          friendly: g.friendly,
          cancelled: g.cancelled,
          member,
          ...(score && { event: score.event, points: score.points }),
          ...(score?.record && { record: score.record }),
          ...(mark && { attendance: mark }),
          ...(team >= 0 && { team }),
        };
      });
      return {
        userId: user?.publicId ?? publicUserId,
        // USR-04: o apelido; sem perfil, o código (o apelido com que a conta nasce, USR-02).
        nickname: user?.nickname ?? publicUserId,
        points: Math.max(0, stats.points),
        attendance: stats.attendance,
        streak: stats.streak,
        record: stats.record,
        games: history,
        trophies:
          deps.trophies && deps.seasons
            ? (
                await trophyViews(
                  { trophies: deps.trophies, groups: deps.groups, seasons: deps.seasons },
                  await deps.trophies.listByUser(id),
                )
              ).filter((t) => t.groupId === groupId)
            : [],
      };
    },
  };
}

/** CMP-24: cada jogo fechado pela sua cópia do regulamento e pelas suas partidas, do mais antigo ao mais recente. */
export async function scoreGames(
  deps: { results: ResultRepository; matches?: MatchRepository | undefined },
  groupId: string,
): Promise<Scored[]> {
  const results = await deps.results.listByGroup(groupId);
  const ordered = [...results].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const matches = await Promise.all(
    ordered.map((r) =>
      r.rules.unit === 'match' && deps.matches ? deps.matches.list(r.gameId) : Promise.resolve([]),
    ),
  );
  return ordered.map((result, i) => ({
    result,
    startsAt: result.startsAt,
    friendly: result.friendly,
    cancelled: result.cancelled,
    members: result.members,
    attendance: result.attendance,
    scores: gamePoints(
      {
        cancelled: result.cancelled,
        friendly: result.friendly,
        members: result.members,
        list: result.list ?? [],
        attendance: result.attendance,
        teams: result.teams,
        winner: result.winner,
        unit: result.rules.unit,
        matches: matches[i] ?? [],
      },
      result.rules,
    ),
  }));
}

/** CMP-38: quem está no pódio da temporada agora (posição até 3), pelos membros de agora. */
export async function podiumIds(
  deps: { results: ResultRepository; matches?: MatchRepository | undefined; groups: GroupRepository },
  groupId: string,
  season: StoredSeason,
): Promise<Set<string>> {
  const games = (await scoreGames(deps, groupId)).filter(
    (g) => g.result.date >= season.startDate && g.result.date <= season.endDate,
  );
  const roster = await deps.groups.listMembers(groupId);
  const members = roster.filter((m) => m.role === 'member').map((m) => m.userId);
  return new Set(
    rankingRows(games, members, season.rules.tiebreak)
      .filter((r) => r.position <= 3)
      .map((r) => r.id),
  );
}

/**
 * CMP-38: avisa quem entrou no pódio da temporada (estava fora e passou a estar dentro). `before` é o pódio de antes da
 * gravação; a temporada precisa estar aberta ou no prazo.
 */
export async function announcePodium(
  deps: {
    results: ResultRepository;
    matches?: MatchRepository | undefined;
    groups: GroupRepository;
    notifications?: Pick<NotificationService, 'notify'> | undefined;
  },
  groupId: string,
  season: StoredSeason,
  before: Set<string>,
): Promise<void> {
  const notifications = deps.notifications;
  if (!notifications) return;
  const after = await podiumIds(deps, groupId, season);
  const games = (await scoreGames(deps, groupId)).filter(
    (g) => g.result.date >= season.startDate && g.result.date <= season.endDate,
  );
  const roster = await deps.groups.listMembers(groupId);
  const members = roster.filter((m) => m.role === 'member').map((m) => m.userId);
  const positionOf = new Map(
    rankingRows(games, members, season.rules.tiebreak).map((r) => [r.id, r.position]),
  );
  const name = season.name ?? `Temporada ${season.number}`;
  for (const id of after) {
    if (before.has(id)) continue;
    await notifications.notify(id as UserId, {
      type: 'podium_entered',
      title: `Você entrou no pódio de ${name}: ${positionOf.get(id) ?? 3}º`,
      link: `/groups/${groupId}/competition`,
    });
  }
}
