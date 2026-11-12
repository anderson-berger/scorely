import { appError } from '@scorely/api/src/lib/errors';
import type { GroupRepository, StoredGroup } from '@scorely/api/src/modules/groups/group.repository';
import { requireActive, requireMember } from '@scorely/api/src/modules/groups/groups.deps';
import type { PlayerRepository } from '@scorely/api/src/modules/teams/player.repository';
import {
  type Game,
  type Member,
  type Player,
  type PlayerPosition,
  SPORT_POSITIONS,
  type UpdatePlayerInput,
} from '@scorely/contracts';

/** O que o módulo de times usa do módulo de grupos e o próprio repositório. */
export interface TeamsDeps {
  groups: GroupRepository;
  roster: {
    /** Membros e reservas na ordem da GRP-06 (= `GroupService.members`). */
    members(userId: string, groupId: string): Promise<Member[]>;
    /** Jogo atual com a lista (= `GameService.current`); só é chamado com o grupo ativo. */
    currentGame(userId: string, groupId: string): Promise<Game>;
  };
  players: PlayerRepository;
  now?: () => Date;
}

/** Ponto único da permissão de times (hoje: o dono). O módulo de permissões troca só isto. */
export function canManageTeams(group: StoredGroup, userId: string): boolean {
  return group.ownerId === userId;
}

type Person = Omit<Player, 'positions'>;

/**
 * TIM-04: quem o dono pode classificar (e pôr em times opostos, TIM-22): membros (GRP-06) e depois os convidados da
 * lista do jogo (dentro e fila). Arquivado: sem jogo, só os membros.
 */
export async function classifiablePeople(
  roster: TeamsDeps['roster'],
  userId: string,
  group: StoredGroup,
): Promise<Person[]> {
  const members = await roster.members(userId, group.id);
  const fromMembers = members.map(
    ({ userId: id, name, role }): Person => ({ userId: id, ...(name && { name }), role }),
  );
  if (group.archivedAt) return fromMembers;
  const game = await roster.currentGame(userId, group.id);
  const known = new Set(members.map((m) => m.userId));
  const guests = [...game.confirmed, ...game.waitlist]
    .filter((a) => !known.has(a.userId))
    .map(({ userId: id, name }): Person => ({ userId: id, ...(name && { name }), role: 'guest' }));
  return [...fromMembers, ...guests];
}

export function createPlayerService(deps: TeamsDeps) {
  const now = deps.now ?? (() => new Date());

  /** TIM-03: só quem gerencia os times muda (404 para quem não participa, 403 para quem não é dono). */
  async function requireManager(userId: string, groupId: string): Promise<StoredGroup> {
    const { group } = await requireMember(deps, userId, groupId);
    if (!canManageTeams(group, userId)) throw appError('GROUP_NOT_OWNER');
    return group;
  }

  const people = (userId: string, group: StoredGroup) => classifiablePeople(deps.roster, userId, group);

  async function withPositions(groupId: string, list: Person[]): Promise<Player[]> {
    const stored = await deps.players.getMany(
      groupId,
      list.map((p) => p.userId),
    );
    const positions = new Map(stored.map((s) => [s.userId, s.positions]));
    return list.map((p) => ({ ...p, positions: positions.get(p.userId) ?? [] }));
  }

  return {
    /** TIM-01, 03, 04: quem participa do grupo vê todos que o dono pode classificar, com as posições (nenhuma quando nunca definido). */
    async list(userId: string, groupId: string): Promise<Player[]> {
      const { group } = await requireMember(deps, userId, groupId);
      return withPositions(group.id, await people(userId, group));
    },

    /** TIM-02–04: grava as posições (a principal primeiro) de quem está no grupo ou na lista do jogo atual. */
    async update(
      userId: string,
      groupId: string,
      targetUserId: string,
      input: UpdatePlayerInput,
    ): Promise<Player> {
      const group = await requireManager(userId, groupId);
      requireActive(group);
      const person = (await people(userId, group)).find((p) => p.userId === targetUserId);
      if (!person) throw appError('TEAM_PLAYER_NOT_FOUND');
      const allowed: readonly PlayerPosition[] = SPORT_POSITIONS[group.sport];
      const invalid = input.positions.find((p) => !allowed.includes(p));
      if (invalid) throw appError('TEAM_POSITION_INVALID', { position: invalid });
      const saved = await deps.players.save(group.id, targetUserId, input.positions, now().toISOString());
      return { ...person, positions: saved.positions };
    },
  };
}

export type PlayerService = ReturnType<typeof createPlayerService>;
