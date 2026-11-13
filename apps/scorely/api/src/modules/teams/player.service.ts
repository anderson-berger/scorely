import { appError } from '@scorely/api/src/lib/errors';
import type { UserId } from '@scorely/api/src/lib/ids';
import type { GroupRepository, StoredGroup } from '@scorely/api/src/modules/groups/group.repository';
import { requireActive, requireMember } from '@scorely/api/src/modules/groups/groups.deps';
import type { RosterGame, RosterMember } from '@scorely/api/src/modules/groups/roster';
import type { PlayerRepository } from '@scorely/api/src/modules/teams/player.repository';
import type { UserDirectory } from '@scorely/api/src/modules/users/user.repository';
import {
  type Player,
  type PlayerPosition,
  type PublicUserId,
  SPORT_POSITIONS,
  type UpdatePlayerInput,
} from '@scorely/contracts';

/** O que o módulo de times usa do módulo de grupos e o próprio repositório. */
export interface TeamsDeps {
  groups: GroupRepository;
  roster: {
    /** Membros e reservas na ordem da GRP-06, com os dois ids (= `GroupService.memberRecords`). */
    members(userId: UserId, groupId: string): Promise<RosterMember[]>;
    /** Jogo atual com a lista e os dois ids (= `GameService.currentRoster`); só é chamado com o grupo ativo. */
    currentGame(userId: UserId, groupId: string): Promise<RosterGame>;
  };
  players: PlayerRepository;
  /** USR-17: o `{userId}` da rota chega pelo id público. */
  users: Pick<UserDirectory, 'resolve'>;
  now?: () => Date;
}

/** Ponto único da permissão de times (hoje: o dono). O módulo de permissões troca só isto. */
export function canManageTeams(group: StoredGroup, userId: UserId): boolean {
  return group.ownerId === userId;
}

/** Alguém classificável, com os dois ids (interno); a resposta sai com o público (USR-16). */
export type Person = Omit<Player, 'positions' | 'userId'> & { userId: UserId; publicId: PublicUserId };

/**
 * TIM-04: quem o dono pode classificar (e pôr em times opostos, TIM-22): membros (GRP-06) e depois os convidados da
 * lista do jogo (dentro e fila). Arquivado: sem jogo, só os membros.
 */
export async function classifiablePeople(
  roster: TeamsDeps['roster'],
  userId: UserId,
  group: StoredGroup,
): Promise<Person[]> {
  const members = await roster.members(userId, group.id);
  const fromMembers = members.map(
    ({ userId: id, publicId, name, role }): Person => ({ userId: id, publicId, ...(name && { name }), role }),
  );
  if (group.archivedAt) return fromMembers;
  const game = await roster.currentGame(userId, group.id);
  const known = new Set(members.map((m) => m.userId));
  const guests = [...game.confirmed, ...game.waitlist]
    .filter((a) => !known.has(a.userId))
    .map(
      ({ userId: id, publicId, name }): Person => ({
        userId: id,
        publicId,
        ...(name && { name }),
        role: 'guest',
      }),
    );
  return [...fromMembers, ...guests];
}

/** USR-16: a pessoa sai pelo id público. */
function toPlayer({ userId: _id, publicId, ...rest }: Person, positions: PlayerPosition[]): Player {
  return { ...rest, userId: publicId, positions };
}

export function createPlayerService(deps: TeamsDeps) {
  const now = deps.now ?? (() => new Date());

  /** TIM-03: só quem gerencia os times muda (404 para quem não participa, 403 para quem não é dono). */
  async function requireManager(userId: UserId, groupId: string): Promise<StoredGroup> {
    const { group } = await requireMember(deps, userId, groupId);
    if (!canManageTeams(group, userId)) throw appError('GROUP_NOT_OWNER');
    return group;
  }

  const people = (userId: UserId, group: StoredGroup) => classifiablePeople(deps.roster, userId, group);

  async function withPositions(groupId: string, list: Person[]): Promise<Player[]> {
    const stored = await deps.players.getMany(
      groupId,
      list.map((p) => p.userId),
    );
    const positions = new Map(stored.map((s) => [s.userId, s.positions]));
    return list.map((p) => toPlayer(p, positions.get(p.userId) ?? []));
  }

  return {
    /** TIM-01, 03, 04: quem participa do grupo vê todos que o dono pode classificar, com as posições (nenhuma quando nunca definido). */
    async list(userId: UserId, groupId: string): Promise<Player[]> {
      const { group } = await requireMember(deps, userId, groupId);
      return withPositions(group.id, await people(userId, group));
    },

    /** TIM-02–04: grava as posições (a principal primeiro) de quem está no grupo ou na lista do jogo atual. */
    async update(
      userId: UserId,
      groupId: string,
      target: PublicUserId,
      input: UpdatePlayerInput,
    ): Promise<Player> {
      const group = await requireManager(userId, groupId);
      requireActive(group);
      // USR-17: id público desconhecido responde igual a quem não está no grupo nem na lista.
      const targetUserId = (await deps.users.resolve([target])).get(target);
      const person = targetUserId && (await people(userId, group)).find((p) => p.userId === targetUserId);
      if (!person) throw appError('TEAM_PLAYER_NOT_FOUND');
      const allowed: readonly PlayerPosition[] = SPORT_POSITIONS[group.sport];
      const invalid = input.positions.find((p) => !allowed.includes(p));
      if (invalid) throw appError('TEAM_POSITION_INVALID', { position: invalid });
      const saved = await deps.players.save(group.id, person.userId, input.positions, now().toISOString());
      return toPlayer(person, saved.positions);
    },
  };
}

export type PlayerService = ReturnType<typeof createPlayerService>;
