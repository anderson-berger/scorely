import type { CreateGroupInput, Group, Invite, Member, MyGroup } from '@scorely/contracts';
import { randomToken } from '../../lib/crypto';
import { newEntity } from '../../lib/entity';
import { appError } from '../../lib/errors';
import { createGameService } from './game.service';
import type { StoredGroup } from './group.repository';
import { type GroupsDeps, requireMember, requireOwner } from './groups.deps';

/** Fuso do grupo quando nem o pedido nem o perfil do dono trazem um (D7). */
const DEFAULT_TIME_ZONE = 'America/Sao_Paulo';

/** Tentativas de remover um membro quando o convite ou a presença mudam no meio (plano 006, D4). */
const REMOVAL_ATTEMPTS = 3;

/** O `inviteToken` só vai para o dono. */
function forViewer(group: StoredGroup, userId: string): Group {
  if (group.ownerId === userId) return group;
  const { inviteToken: _token, ...rest } = group;
  return rest;
}

export function createGroupService(deps: GroupsDeps) {
  const now = deps.now ?? (() => new Date());
  const games = createGameService(deps);

  /** Uma tentativa da remoção (D12 do 003); `stale` → relê o grupo e o plano e tenta de novo. */
  async function attemptRemoval(group: StoredGroup, memberId: string, attempt: number): Promise<void> {
    const plan = await games.removalPlan(group, memberId);
    const result = await deps.groups.removeMember({
      group,
      userId: memberId,
      newToken: randomToken(),
      ...(plan.attendance && { attendance: plan.attendance }),
    });
    if (result === 'not_member') throw appError('GROUP_MEMBER_NOT_FOUND');
    if (result === 'removed') return plan.afterRemoval();
    if (attempt >= REMOVAL_ATTEMPTS) throw new Error('Member removal kept conflicting with other writes');
    const fresh = await deps.groups.get(group.id, { consistent: true });
    if (!fresh) throw appError('GROUP_NOT_FOUND');
    return attemptRemoval(fresh, memberId, attempt + 1);
  }

  return {
    async create(ownerId: string, input: CreateGroupInput): Promise<Group> {
      const owner = await deps.users.get(ownerId);
      const group = newEntity<StoredGroup>(
        {
          ...input,
          timeZone: input.timeZone ?? owner?.timeZone ?? DEFAULT_TIME_ZONE,
          ownerId,
          inviteToken: randomToken(),
        },
        now(),
      );
      await deps.groups.create(group);
      return group;
    },

    async get(userId: string, groupId: string): Promise<Group> {
      return forViewer(await requireMember(deps, userId, groupId), userId);
    },

    async myGroups(userId: string): Promise<MyGroup[]> {
      const ids = await deps.groups.listGroupsOf(userId);
      const groups = await Promise.all(ids.map((id) => deps.groups.get(id)));
      return Promise.all(
        groups
          .filter((g): g is StoredGroup => g !== undefined)
          .map(async (g) => ({ ...forViewer(g, userId), game: await games.summary(userId, g) })),
      );
    },

    /** Gera outro link: o anterior deixa de valer (D9). */
    async rotateInvite(userId: string, groupId: string): Promise<Invite> {
      const group = await requireOwner(deps, userId, groupId);
      const inviteToken = randomToken();
      await deps.groups.rotateInvite(group, inviteToken);
      return { inviteToken };
    },

    /** Entra pelo link. Já membro → nada muda. */
    async acceptInvite(userId: string, token: string): Promise<Group> {
      const group = await deps.groups.getByInvite(token);
      if (!group) throw appError('GROUP_INVITE_INVALID');
      await deps.groups.addMember(group.id, userId);
      return forViewer(group, userId);
    },

    async members(userId: string, groupId: string): Promise<Member[]> {
      const group = await requireMember(deps, userId, groupId);
      const ids = await deps.groups.listMembers(groupId);
      const users = new Map((await deps.users.getMany(ids)).map((u) => [u.id, u]));
      const members = ids.map((id) => {
        const user = users.get(id);
        const name = user?.nickname ?? user?.name;
        return { userId: id, ...(name && { name }), isOwner: id === group.ownerId };
      });
      return [...members.filter((m) => m.isOwner), ...members.filter((m) => !m.isOwner)];
    },

    /** D12: tira o acesso, troca o link e (com a lista aberta) a vaga; depois, promoção (D6). */
    async removeMember(userId: string, groupId: string, memberId: string): Promise<void> {
      const group = await requireOwner(deps, userId, groupId);
      if (memberId === group.ownerId) throw appError('GROUP_OWNER_NOT_REMOVABLE');
      if (!(await deps.groups.isMember(groupId, memberId))) throw appError('GROUP_MEMBER_NOT_FOUND');
      await attemptRemoval(group, memberId, 1);
    },
  };
}
export type GroupService = ReturnType<typeof createGroupService>;
