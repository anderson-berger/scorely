import {
  type Attendee,
  type Game,
  type GroupRole,
  type GuestGame,
  type PlayerPosition,
  type SaveTeamsInput,
  SPORT_POSITIONS,
  type TeamPlayer,
  type Teams,
  type TeamsResponse,
} from '@scorely/contracts';
import { appError } from '../../lib/errors';
import type { GroupRepository, StoredGroup } from '../groups/group.repository';
import { requireActive, requireMember } from '../groups/groups.deps';
import type { NotificationService } from '../notifications/notification.service';
import type { UserDirectory } from '../users/user.repository';
import type { PlayerRepository } from './player.repository';
import { canManageTeams } from './player.service';
import type { StoredTeams, TeamsRepository } from './teams.repository';

/** O que os times do jogo usam do módulo de grupos, das posições, dos usuários e dos avisos. */
export interface TeamsServiceDeps {
  groups: GroupRepository;
  roster: {
    /** Jogo atual com a lista (= `GameService.current`); responde `GROUP_ARCHIVED` com o grupo arquivado. */
    currentGame(userId: string, groupId: string): Promise<Game>;
    /** Jogo atual pelo link do jogo (= `GameService.guestView`, GRP-09). */
    guestView(userId: string, token: string): Promise<GuestGame>;
  };
  /** Posições do grupo (TIM-04). */
  players: Pick<PlayerRepository, 'getMany'>;
  /** Nome de quem saiu da lista (TIM-12). */
  users: Pick<UserDirectory, 'getMany'>;
  notifications: Pick<NotificationService, 'notify'>;
  teams: TeamsRepository;
  now?: () => Date;
}

const NONE: TeamsResponse = { teams: null };

/** "06/11" a partir de "2026-11-06" (texto do aviso em pt-BR, NTF-03). */
function dayMonth(date: string): string {
  const [, month, day] = date.split('-');
  return `${day}/${month}`;
}

export function createTeamsService(deps: TeamsServiceDeps) {
  const now = deps.now ?? (() => new Date());

  /** TIM-07: só o dono escreve (404 para quem não participa, 403 para quem não é dono), e o grupo ativo (TIM-11). */
  async function requireManager(userId: string, groupId: string): Promise<StoredGroup> {
    const { group } = await requireMember(deps, userId, groupId);
    if (!canManageTeams(group, userId)) throw appError('GROUP_NOT_OWNER');
    requireActive(group);
    return group;
  }

  /** TIM-06: só o jogo atual. */
  async function currentGame(userId: string, groupId: string, date: string): Promise<Game> {
    const game = await deps.roster.currentGame(userId, groupId);
    if (game.date !== date) throw appError('GAME_NOT_FOUND');
    return game;
  }

  /** TIM-11: com o jogo cancelado não se mexe nos times. */
  async function writableGame(userId: string, groupId: string, date: string): Promise<Game> {
    const game = await currentGame(userId, groupId, date);
    if (game.status === 'cancelled') throw appError('GAME_CANCELLED');
    return game;
  }

  /** O papel de quem saiu da lista (TIM-12): o do grupo, se ainda participa; senão, convidado. */
  async function roleOutsideList(groupId: string, userId: string): Promise<GroupRole> {
    return (await deps.groups.roleOf(groupId, userId)) ?? 'guest';
  }

  /** Monta a resposta: posições valendo no jogo (TIM-13), quem saiu da lista (TIM-12) e, só para o dono, "sem time". */
  async function view(groupId: string, game: Game, stored: StoredTeams, forOwner: boolean): Promise<Teams> {
    const inList = new Map<string, { attendee: Attendee; bench: boolean }>([
      ...game.confirmed.map((a) => [a.userId, { attendee: a, bench: false }] as const),
      ...game.waitlist.map((a) => [a.userId, { attendee: a, bench: true }] as const),
    ]);
    const placed = new Set(stored.teams.flat());
    const unassigned = forOwner ? game.confirmed.map((a) => a.userId).filter((id) => !placed.has(id)) : [];
    const everyone = [...placed, ...unassigned];
    const missing = everyone.filter((id) => !inList.has(id));

    const [defaults, users, roles] = await Promise.all([
      deps.players.getMany(groupId, everyone),
      deps.users.getMany(missing),
      Promise.all(missing.map(async (id) => [id, await roleOutsideList(groupId, id)] as const)),
    ]);
    const groupPositions = new Map(defaults.map((p) => [p.userId, p.positions]));
    const names = new Map(users.map((u) => [u.id, u.name]));
    const outsideRoles = new Map(roles);

    const person = (userId: string): TeamPlayer => {
      const adjusted = stored.positions[userId];
      const listed = inList.get(userId);
      const name = listed ? listed.attendee.name : names.get(userId);
      return {
        userId,
        ...(name && { name }),
        role: listed ? listed.attendee.role : (outsideRoles.get(userId) ?? 'guest'),
        positions: adjusted ?? groupPositions.get(userId) ?? [],
        adjusted: adjusted !== undefined,
        inList: listed !== undefined,
        bench: listed?.bench ?? false,
      };
    };

    return {
      groupId,
      date: stored.date,
      status: stored.status,
      teams: stored.teams.map((team) => team.map(person)),
      unassigned: unassigned.map(person),
      ...(stored.publishedAt && { publishedAt: stored.publishedAt }),
    };
  }

  /** TIM-08, 12, 13: só quem está na lista (ou já estava nos times salvos) e posições do esporte. */
  function validate(
    group: StoredGroup,
    game: Game,
    existing: StoredTeams | undefined,
    input: SaveTeamsInput,
  ): void {
    const allowed = new Set([
      ...game.confirmed.map((a) => a.userId),
      ...game.waitlist.map((a) => a.userId),
      ...(existing?.teams.flat() ?? []),
    ]);
    const referenced = [...input.teams.flat(), ...Object.keys(input.positions)];
    if (referenced.some((id) => !allowed.has(id))) throw appError('TEAM_PLAYER_NOT_FOUND');
    const sport: readonly PlayerPosition[] = SPORT_POSITIONS[group.sport];
    const invalid = Object.values(input.positions)
      .flat()
      .find((p) => !sport.includes(p));
    if (invalid) throw appError('TEAM_POSITION_INVALID', { position: invalid });
  }

  /** TIM-10: na 1ª publicação, avisa a lista (dentro e fila), menos o dono. */
  async function notifyPublished(group: StoredGroup, game: Game): Promise<void> {
    const people = [...game.confirmed, ...game.waitlist].filter((a) => a.userId !== group.ownerId);
    await Promise.all(
      people.map((a) =>
        deps.notifications.notify(a.userId, {
          type: 'teams_published',
          title: 'Times publicados',
          body: `Os times de ${group.name} para ${dayMonth(game.date)} estão prontos.`,
          link: a.role === 'guest' && group.guestToken ? `/play/${group.guestToken}` : `/groups/${group.id}`,
        }),
      ),
    );
  }

  return {
    /** TIM-06, 09, 11–13: rascunho só para o dono; jogo cancelado (ou grupo arquivado, sem jogo) → sem times. */
    async get(userId: string, groupId: string, date: string): Promise<TeamsResponse> {
      const { group } = await requireMember(deps, userId, groupId);
      if (group.archivedAt) return NONE;
      const game = await currentGame(userId, groupId, date);
      if (game.status === 'cancelled') return NONE;
      const stored = await deps.teams.get(group.id, date);
      const forOwner = canManageTeams(group, userId);
      if (!stored || (stored.status === 'draft' && !forOwner)) return NONE;
      return { teams: await view(group.id, game, stored, forOwner) };
    },

    /** TIM-06–08, 11–13: cria o rascunho ou substitui os times, sem mudar o status. */
    async save(userId: string, groupId: string, date: string, input: SaveTeamsInput): Promise<TeamsResponse> {
      const group = await requireManager(userId, groupId);
      const game = await writableGame(userId, groupId, date);
      const existing = await deps.teams.get(group.id, date);
      validate(group, game, existing, input);
      const at = now().toISOString();
      const next: StoredTeams = {
        groupId: group.id,
        date,
        status: existing?.status ?? 'draft',
        teams: input.teams,
        positions: input.positions,
        ...(existing?.publishedAt && { publishedAt: existing.publishedAt }),
        createdAt: existing?.createdAt ?? at,
        updatedAt: at,
      };
      await deps.teams.put(next);
      return { teams: await view(group.id, game, next, true) };
    },

    /** TIM-08–10: todo time com alguém; avisa só na 1ª publicação. */
    async publish(userId: string, groupId: string, date: string): Promise<TeamsResponse> {
      const group = await requireManager(userId, groupId);
      const game = await writableGame(userId, groupId, date);
      const existing = await deps.teams.get(group.id, date);
      if (!existing) throw appError('TEAM_EMPTY', { team: 1 });
      const empty = existing.teams.findIndex((team) => team.length === 0);
      if (empty >= 0) throw appError('TEAM_EMPTY', { team: empty + 1 });
      const at = now().toISOString();
      const next: StoredTeams = {
        ...existing,
        status: 'published',
        publishedAt: existing.publishedAt ?? at,
        updatedAt: at,
      };
      await deps.teams.put(next);
      if (!existing.publishedAt) await notifyPublished(group, game);
      return { teams: await view(group.id, game, next, true) };
    },

    /** TIM-09: volta para rascunho (some para os outros). Sem times → nada muda. */
    async unpublish(userId: string, groupId: string, date: string): Promise<TeamsResponse> {
      const group = await requireManager(userId, groupId);
      const game = await writableGame(userId, groupId, date);
      const existing = await deps.teams.get(group.id, date);
      if (!existing) return NONE;
      const next: StoredTeams = { ...existing, status: 'draft', updatedAt: now().toISOString() };
      await deps.teams.put(next);
      return { teams: await view(group.id, game, next, true) };
    },

    /** TIM-06: descarta os times do jogo. Sem times → nada muda. */
    async discard(userId: string, groupId: string, date: string): Promise<void> {
      const group = await requireManager(userId, groupId);
      await writableGame(userId, groupId, date);
      if (await deps.teams.get(group.id, date)) await deps.teams.delete(group.id, date);
    },

    /** TIM-09 / GRP-09: pelo link do jogo, só os times publicados (sem "sem time"). */
    async guestGet(userId: string, token: string): Promise<TeamsResponse> {
      const { group, game } = await deps.roster.guestView(userId, token);
      if (game.status === 'cancelled') return NONE;
      const stored = await deps.teams.get(group.id, game.date);
      if (stored?.status !== 'published') return NONE;
      return { teams: await view(group.id, game, stored, false) };
    },
  };
}

export type TeamsService = ReturnType<typeof createTeamsService>;
