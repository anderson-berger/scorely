import {
  type CreateGroupInput,
  type Group,
  GroupLayersSchema,
  type Invite,
  type InviteKind,
  type Member,
  type MemberRole,
  type MyGroup,
  type UpdateGroupInput,
} from '@scorely/contracts';
import { randomToken } from '../../lib/crypto';
import { newEntity } from '../../lib/entity';
import { appError } from '../../lib/errors';
import { createGameService } from './game.service';
import type { StoredGroup } from './group.repository';
import { forViewer, type GroupsDeps, requireMember, requireOwner, reservesHours } from './groups.deps';

/** Fuso do grupo quando nem o pedido nem o perfil do dono trazem um (D7 do 003). */
const DEFAULT_TIME_ZONE = 'America/Sao_Paulo';

/** Tentativas de remover um membro quando o convite ou a presença mudam no meio (plano 006, D4). */
const REMOVAL_ATTEMPTS = 3;

/** Confere a ordem das camadas (plano 007, D2) com os valores finais. Fora de ordem → `GROUP_LAYERS_INVALID`. */
function assertLayers(layers: {
  listOpensHoursBefore: number;
  reservesOpenHoursBefore: number;
  guestsOpenHoursBefore?: number | null | undefined;
}): void {
  const parsed = GroupLayersSchema.safeParse(layers);
  if (parsed.success) return;
  const field = parsed.error.issues[0]?.path[0];
  throw appError('GROUP_LAYERS_INVALID', {
    field: field === 'guestsOpenHoursBefore' ? 'guestsOpenHoursBefore' : 'reservesOpenHoursBefore',
  });
}

const ROLE_ORDER: Record<MemberRole, number> = { member: 0, reserve: 1 };

export function createGroupService(deps: GroupsDeps) {
  const now = deps.now ?? (() => new Date());
  const games = createGameService(deps);

  /** Uma tentativa da remoção (D12 do 003); `stale` → relê o grupo e o plano e tenta de novo. */
  async function attemptRemoval(
    group: StoredGroup,
    memberId: string,
    role: MemberRole,
    attempt: number,
  ): Promise<void> {
    const plan = await games.removalPlan(group, memberId);
    const result = await deps.groups.removeMember({
      group,
      userId: memberId,
      role,
      newToken: randomToken(),
      ...(plan.attendance && { attendance: plan.attendance }),
    });
    if (result === 'not_member') throw appError('GROUP_MEMBER_NOT_FOUND');
    if (result === 'removed') return plan.afterRemoval();
    if (attempt >= REMOVAL_ATTEMPTS) throw new Error('Member removal kept conflicting with other writes');
    const fresh = await deps.groups.get(group.id, { consistent: true });
    if (!fresh) throw appError('GROUP_NOT_FOUND');
    return attemptRemoval(fresh, memberId, role, attempt + 1);
  }

  return {
    async create(ownerId: string, input: CreateGroupInput): Promise<Group> {
      const reservesOpenHoursBefore =
        input.reservesOpenHoursBefore ?? Math.floor(input.listOpensHoursBefore / 2);
      assertLayers({ ...input, reservesOpenHoursBefore });
      const owner = await deps.users.get(ownerId);
      const group = newEntity<StoredGroup>(
        {
          ...input,
          reservesOpenHoursBefore,
          timeZone: input.timeZone ?? owner?.timeZone ?? DEFAULT_TIME_ZONE,
          ownerId,
          inviteToken: randomToken(),
          reserveInviteToken: randomToken(),
          guestToken: randomToken(),
        },
        now(),
      );
      await deps.groups.create(group);
      return forViewer(group, ownerId, 'member');
    },

    async get(userId: string, groupId: string): Promise<Group> {
      const { group, role } = await requireMember(deps, userId, groupId);
      return forViewer(group, userId, role);
    },

    async myGroups(userId: string): Promise<MyGroup[]> {
      const ids = await deps.groups.listGroupsOf(userId);
      const rows = await Promise.all(
        ids.map(async (id) => {
          const [group, role] = await Promise.all([deps.groups.get(id), deps.groups.roleOf(id, userId)]);
          return group && role ? [{ group, role }] : [];
        }),
      );
      return Promise.all(
        rows.flat().map(async ({ group, role }) => ({
          ...forViewer(group, userId, role),
          game: await games.summary(userId, group),
        })),
      );
    },

    /** D11: o dono muda as camadas. Junta com o atual e confere a ordem antes de gravar. */
    async update(userId: string, groupId: string, patch: UpdateGroupInput): Promise<Group> {
      const group = await requireOwner(deps, userId, groupId);
      const layers = {
        listOpensHoursBefore: patch.listOpensHoursBefore ?? group.listOpensHoursBefore,
        reservesOpenHoursBefore: patch.reservesOpenHoursBefore ?? reservesHours(group),
        guestsOpenHoursBefore:
          patch.guestsOpenHoursBefore === undefined
            ? group.guestsOpenHoursBefore
            : patch.guestsOpenHoursBefore,
      };
      assertLayers(layers);
      // Grava as reservas efetivas: grupo de antes da E2 deixa de depender do padrão (D3).
      const updated = await deps.groups.update(groupId, {
        ...patch,
        reservesOpenHoursBefore: layers.reservesOpenHoursBefore,
      });
      return forViewer(updated, userId, 'member');
    },

    /** Gera outro link do tipo: o anterior deixa de valer (D9 do 003, D5 do 007). */
    async rotateInvite(userId: string, groupId: string, kind: InviteKind = 'member'): Promise<Invite> {
      const group = await requireOwner(deps, userId, groupId);
      if (kind === 'guest' && group.guestsOpenHoursBefore == null) throw appError('GAME_LINK_INVALID');
      const token = randomToken();
      await deps.groups.rotateToken(group, kind, token);
      return { kind, token };
    },

    /** Entra pelo link de membro ou de reserva (D5). Já participa → só sobe de reserva para membro. */
    async acceptInvite(userId: string, token: string): Promise<Group> {
      const found = await deps.groups.getByToken(token);
      if (!found || found.kind === 'guest') throw appError('GROUP_INVITE_INVALID');
      await deps.groups.addMember(found.group.id, userId, found.kind);
      const role = (await deps.groups.roleOf(found.group.id, userId)) ?? found.kind;
      return forViewer(found.group, userId, role);
    },

    /** Dono no topo, depois os membros e por último as reservas. */
    async members(userId: string, groupId: string): Promise<Member[]> {
      const { group } = await requireMember(deps, userId, groupId);
      const list = await deps.groups.listMembers(groupId);
      const users = new Map((await deps.users.getMany(list.map((m) => m.userId))).map((u) => [u.id, u]));
      const members = list.map(({ userId: id, role }) => {
        const user = users.get(id);
        const name = user?.nickname ?? user?.name;
        return { userId: id, ...(name && { name }), isOwner: id === group.ownerId, role };
      });
      const rank = (m: Member) => (m.isOwner ? -1 : ROLE_ORDER[m.role]);
      return [...members].sort((a, b) => rank(a) - rank(b));
    },

    /** D12 do 003 / D10 do 007: tira o acesso, troca o link do papel e (com a lista aberta) a vaga; depois, promoção. */
    async removeMember(userId: string, groupId: string, memberId: string): Promise<void> {
      const group = await requireOwner(deps, userId, groupId);
      if (memberId === group.ownerId) throw appError('GROUP_OWNER_NOT_REMOVABLE');
      const role = await deps.groups.roleOf(groupId, memberId);
      if (!role) throw appError('GROUP_MEMBER_NOT_FOUND');
      await attemptRemoval(group, memberId, role, 1);
    },
  };
}
export type GroupService = ReturnType<typeof createGroupService>;
