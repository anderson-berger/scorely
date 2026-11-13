import { randomToken } from '@scorely/api/src/lib/crypto';
import { newEntity } from '@scorely/api/src/lib/entity';
import { appError } from '@scorely/api/src/lib/errors';
import type { UserId } from '@scorely/api/src/lib/ids';
import { createGameService } from '@scorely/api/src/modules/groups/game.service';
import {
  type GroupMember,
  limitsOf,
  type StoredGroup,
} from '@scorely/api/src/modules/groups/group.repository';
import {
  forViewer,
  type GroupsDeps,
  permissionsOf,
  requireActive,
  requireMember,
  requireOwner,
  requirePermission,
  reservesHours,
  staffRoleOf,
} from '@scorely/api/src/modules/groups/groups.deps';
import { publicMember, type RosterMember } from '@scorely/api/src/modules/groups/roster';
import {
  type CreateGroupInput,
  type Group,
  GroupLayersSchema,
  type Invite,
  type InviteKind,
  type Member,
  type MemberInvite,
  type MemberRole,
  type MyGroup,
  type PublicUserId,
  type StaffRoleId,
  type UpdateGroupInput,
} from '@scorely/contracts';

/** Fuso do grupo quando nem o pedido nem o perfil do dono trazem um (D7 do 003). */
const DEFAULT_TIME_ZONE = 'America/Sao_Paulo';

/** Tentativas de remover um membro quando o convite ou a presença mudam no meio (plano 006, D4). */
const REMOVAL_ATTEMPTS = 3;

/** Tentativas de entrar ou aceitar o convite quando o limite muda no meio (GRP-39). */
const JOIN_ATTEMPTS = 3;

/** Prazo do convite para membro (GRP-40). */
const MEMBER_INVITE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Tentativas de arquivar quando um link é trocado no meio (GRP-31). */
const ARCHIVE_ATTEMPTS = 3;

/** O grupo como fica depois de arquivar: com `archivedAt` e sem os 3 tokens (GRP-31). */
function archivedCopy(group: StoredGroup, archivedAt: string): StoredGroup {
  const { inviteToken: _i, reserveInviteToken: _r, guestToken: _g, ...rest } = group;
  return { ...rest, archivedAt };
}

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

/**
 * Camadas de um grupo novo quando o pedido não traz nenhuma (GRP-15). Ficam só aqui: o padrão é regra de
 * negócio da api, e o web não conhece esses números. Convidados sem valor = desligados.
 */
const CREATE_DEFAULTS = { listOpensHoursBefore: 48, reservesOpenHoursBefore: 24 } as const;

/** Limites de um grupo novo (GRP-38): decididos pela api, o form de criar não pede. */
const CREATE_LIMITS = { maxMembers: 30, maxReserves: 30 } as const;

/**
 * Membros e reservas de um grupo novo (GRP-15): sem nenhuma camada, os padrões; com os membros e sem as
 * reservas, reservas na metade dos membros (arredondando para baixo).
 */
function createLayers(input: Pick<CreateGroupInput, 'listOpensHoursBefore' | 'reservesOpenHoursBefore'>): {
  listOpensHoursBefore: number;
  reservesOpenHoursBefore: number;
} {
  if (input.listOpensHoursBefore === undefined) {
    return {
      listOpensHoursBefore: CREATE_DEFAULTS.listOpensHoursBefore,
      reservesOpenHoursBefore: input.reservesOpenHoursBefore ?? CREATE_DEFAULTS.reservesOpenHoursBefore,
    };
  }
  return {
    listOpensHoursBefore: input.listOpensHoursBefore,
    reservesOpenHoursBefore: input.reservesOpenHoursBefore ?? Math.floor(input.listOpensHoursBefore / 2),
  };
}

const ROLE_ORDER: Record<MemberRole, number> = { member: 0, reserve: 1 };

/** `VALIDATION_ERROR` de uma ação sobre a própria pessoa que não cabe (GRP-25, 51, 54). */
function selfTargetError(message: string) {
  return appError('VALIDATION_ERROR', { issues: [{ code: 'custom', path: ['userId'], message }] });
}

export function createGroupService(deps: GroupsDeps) {
  const now = deps.now ?? (() => new Date());
  const games = createGameService(deps);

  /** Uma tentativa da remoção (D12 do 003); `stale` → relê o grupo e o plano e tenta de novo. */
  async function attemptRemoval(
    group: StoredGroup,
    memberId: UserId,
    role: MemberRole,
    attempt: number,
    rotate: boolean,
  ): Promise<void> {
    const plan = await games.removalPlan(group, memberId);
    const result = await deps.groups.removeMember({
      group,
      userId: memberId,
      role,
      // GRP-42: quem sai não está sendo bloqueado, então o link não muda.
      ...(rotate && { newToken: randomToken() }),
      ...(plan.attendance && { attendance: plan.attendance }),
    });
    if (result === 'not_member') throw appError('GROUP_MEMBER_NOT_FOUND');
    if (result === 'removed') return plan.afterRemoval();
    if (attempt >= REMOVAL_ATTEMPTS) throw new Error('Member removal kept conflicting with other writes');
    // Relê o grupo (token) e o papel (reserva promovida no meio, D6 do 013) antes de tentar de novo.
    const [fresh, freshRole] = await Promise.all([
      deps.groups.get(group.id, { consistent: true }),
      deps.groups.roleOf(group.id, memberId),
    ]);
    if (!fresh) throw appError('GROUP_NOT_FOUND');
    if (!freshRole) throw appError('GROUP_MEMBER_NOT_FOUND');
    // O grupo pode ter sido arquivado no meio (GRP-32): sem isto, a nova tentativa criaria um link num grupo arquivado.
    requireActive(fresh);
    return attemptRemoval(fresh, memberId, freshRole, attempt + 1, rotate);
  }

  /** GRP-02/39: uma tentativa de entrar pelo link; `stale` → relê o grupo (limite trocado ou arquivado) e tenta de novo. */
  async function attemptJoin(
    group: StoredGroup,
    userId: UserId,
    role: MemberRole,
    attempt: number,
  ): Promise<void> {
    const result = await deps.groups.addMember(group, userId, role);
    if (result === 'members_full') throw appError('GROUP_MEMBERS_FULL');
    if (result === 'reserves_full') throw appError('GROUP_RESERVES_FULL');
    if (result !== 'stale') return;
    if (attempt >= JOIN_ATTEMPTS) throw new Error('Group join kept conflicting with other writes');
    const fresh = await deps.groups.get(group.id, { consistent: true });
    // Arquivado no meio: o link deixou de valer (GRP-31).
    if (!fresh || fresh.archivedAt) throw appError('GROUP_INVITE_INVALID');
    return attemptJoin(fresh, userId, role, attempt + 1);
  }

  /** GRP-41: uma tentativa do aceite; `stale` → relê o grupo e tenta de novo. */
  async function attemptAccept(group: StoredGroup, userId: UserId, attempt: number): Promise<StoredGroup> {
    const result = await deps.groups.acceptMemberInvite(group, userId, now().toISOString());
    if (result === 'promoted') return group;
    if (result === 'invalid') throw appError('GROUP_MEMBER_INVITE_INVALID');
    if (result === 'members_full') throw appError('GROUP_MEMBERS_FULL');
    if (attempt >= JOIN_ATTEMPTS) throw new Error('Member invite accept kept conflicting with other writes');
    const fresh = await deps.groups.get(group.id, { consistent: true });
    if (!fresh) throw appError('GROUP_NOT_FOUND');
    requireActive(fresh);
    return attemptAccept(fresh, userId, attempt + 1);
  }

  /** O convite vale até `expiresAt`, exclusivo (GRP-40, 41). */
  const pendingInvite = (expiresAt: string | undefined) =>
    expiresAt !== undefined && expiresAt > now().toISOString() ? expiresAt : undefined;

  /** Uma tentativa de arquivar (GRP-31). Já arquivado → devolve como está; `stale` → relê e tenta de novo. */
  async function attemptArchive(group: StoredGroup, attempt: number): Promise<StoredGroup> {
    if (group.archivedAt) return group;
    const archivedAt = now().toISOString();
    if ((await deps.groups.archive(group, archivedAt)) === 'archived') return archivedCopy(group, archivedAt);
    if (attempt >= ARCHIVE_ATTEMPTS) throw new Error('Group archive kept conflicting with other writes');
    const fresh = await deps.groups.get(group.id, { consistent: true });
    if (!fresh) throw appError('GROUP_NOT_FOUND');
    return attemptArchive(fresh, attempt + 1);
  }

  /**
   * Dono no topo, depois os membros e por último as reservas; dentro de cada papel, por data de entrada (D9 do 013).
   * Com os dois ids de cada pessoa (interno, para os times); a resposta pública sai pelo `members`.
   */
  async function memberRecords(userId: UserId, groupId: string): Promise<RosterMember[]> {
    const { group, staffRoleId: viewerStaffRoleId } = await requireMember(deps, userId, groupId);
    const list = await deps.groups.listMembers(groupId);
    const users = new Map((await deps.users.getMany(list.map((m) => m.userId))).map((u) => [u.id, u]));

    const isOwner = (id: string) => id === group.ownerId;
    const rank = (m: GroupMember) => (isOwner(m.userId) ? -1 : ROLE_ORDER[m.role]);
    const ordered = [...list].sort((a, b) => rank(a) - rank(b) || a.createdAt.localeCompare(b.createdAt));
    // GRP-40: só quem cuida dos membros vê o prazo do convite pendente.
    const viewerManages = permissionsOf(group, userId, viewerStaffRoleId).includes('members.manage');
    return ordered.map(({ userId: id, role, memberInviteExpiresAt, staffRoleId }): RosterMember => {
      const user = users.get(id);
      if (!user) throw new Error('Member without a user profile');
      const name = user.nickname ?? user.name;
      const invite = viewerManages ? pendingInvite(memberInviteExpiresAt) : undefined;
      // GRP-55: o cargo é de todos verem; o dono não tem cargo (GRP-48).
      const staffRole = isOwner(id) ? undefined : staffRoleOf(staffRoleId);
      return {
        userId: id,
        publicId: user.publicId,
        ...(name && { name }),
        isOwner: isOwner(id),
        role,
        ...(staffRole && { staffRole }),
        ...(invite && { memberInviteExpiresAt: invite }),
      };
    });
  }

  /** USR-17: a pessoa atingida chega pelo id público; desconhecido responde como alguém fora do grupo. */
  async function resolveTarget(target: PublicUserId): Promise<UserId> {
    const id = (await deps.users.resolve([target])).get(target);
    if (!id) throw appError('GROUP_MEMBER_NOT_FOUND');
    return id;
  }

  /** GRP-51: só o dono, grupo ativo, e o alvo é um membro ou reserva que não é o dono. */
  async function staffTarget(ownerId: UserId, groupId: string, target: PublicUserId) {
    const group = await requireOwner(deps, ownerId, groupId);
    requireActive(group);
    const userId = await resolveTarget(target);
    if (userId === group.ownerId) throw selfTargetError('The owner has no staff role');
    const membership = await deps.groups.getMembership(groupId, userId);
    if (!membership) throw appError('GROUP_MEMBER_NOT_FOUND');
    return { group, membership, userId };
  }

  return {
    async create(ownerId: UserId, input: CreateGroupInput): Promise<Group> {
      const layers = createLayers(input);
      assertLayers({ ...input, ...layers });
      // GRP-13: sem fuso no pedido, o das preferências do dono (USR-07).
      const [preferences, owner] = await Promise.all([
        deps.users.getPreferences(ownerId),
        deps.users.get(ownerId),
      ]);
      if (!owner) throw appError('USER_NOT_FOUND');
      const timeZone = input.timeZone ?? preferences.timeZone ?? DEFAULT_TIME_ZONE;
      const group = newEntity<StoredGroup>(
        {
          ...input,
          ...layers,
          ...CREATE_LIMITS,
          timeZone,
          ownerId,
          // USR-16: o `ownerId` da resposta é o público; como o código não muda (USR-15), a cópia não fica velha.
          ownerPublicId: owner.publicId,
          inviteToken: randomToken(),
          reserveInviteToken: randomToken(),
          guestToken: randomToken(),
        },
        now(),
      );
      await deps.groups.create(group);
      return forViewer(group, ownerId, 'member');
    },

    async get(userId: UserId, groupId: string): Promise<Group> {
      const { group, role, staffRoleId } = await requireMember(deps, userId, groupId);
      const view = forViewer(group, userId, role, staffRoleId);
      if (role !== 'reserve') return view;
      // GRP-40, 41: a reserva com convite pendente vê o prazo para aceitar ou recusar.
      const expiresAt = pendingInvite(
        (await deps.groups.getMembership(groupId, userId))?.memberInviteExpiresAt,
      );
      return expiresAt ? { ...view, myMemberInvite: { expiresAt } } : view;
    },

    async myGroups(userId: UserId): Promise<MyGroup[]> {
      // Plano 013, D7: grupo e papel numa leitura só (Query + BatchGet), sem get/roleOf por grupo.
      // GRP-31: arquivado sai daqui e vai para `archivedGroups`.
      const rows = (await deps.groups.groupsOf(userId)).filter(({ group }) => !group.archivedAt);
      return Promise.all(
        rows.map(async ({ group, role, staffRoleId }) => ({
          ...forViewer(group, userId, role, staffRoleId),
          game: await games.summary(userId, group),
        })),
      );
    },

    /** GRP-31: só os arquivados, do arquivado mais recente para o mais antigo, sem o resumo do jogo. */
    async archivedGroups(userId: UserId): Promise<Group[]> {
      const rows = await deps.groups.groupsOf(userId);
      return rows
        .flatMap((row) => (row.group.archivedAt ? [{ ...row, at: row.group.archivedAt }] : []))
        .sort((a, b) => b.at.localeCompare(a.at))
        .map(({ group, role, staffRoleId }) => forViewer(group, userId, role, staffRoleId));
    },

    /** GRP-31: arquiva (links param na hora) e cancela o jogo aberto. Arquivar de novo só completa o cancelamento. */
    async archive(userId: UserId, groupId: string): Promise<Group> {
      const group = await requireOwner(deps, userId, groupId);
      const archived = await attemptArchive(group, 1);
      await games.cancelForArchive(archived);
      return forViewer(archived, userId, 'member');
    },

    /** GRP-33: volta com 3 links novos. Grupo ativo → devolve como está. */
    async unarchive(userId: UserId, groupId: string): Promise<Group> {
      const group = await requireOwner(deps, userId, groupId);
      if (!group.archivedAt) return forViewer(group, userId, 'member');
      const tokens = {
        inviteToken: randomToken(),
        reserveInviteToken: randomToken(),
        guestToken: randomToken(),
      };
      if ((await deps.groups.unarchive(group, tokens)) === 'unarchived') {
        const { archivedAt: _a, ...rest } = group;
        return forViewer({ ...rest, ...tokens }, userId, 'member');
      }
      // Outra requisição desarquivou antes: devolve o grupo como ficou.
      const fresh = await deps.groups.get(groupId, { consistent: true });
      if (!fresh) throw appError('GROUP_NOT_FOUND');
      return forViewer(fresh, userId, 'member');
    },

    /** GRP-16: quem tem `settings.edit` muda as camadas. Junta com o atual e confere a ordem antes de gravar. */
    async update(userId: UserId, groupId: string, patch: UpdateGroupInput): Promise<Group> {
      const { group, role, staffRoleId } = await requirePermission(deps, userId, groupId, 'settings.edit');
      requireActive(group);
      const layers = {
        listOpensHoursBefore: patch.listOpensHoursBefore ?? group.listOpensHoursBefore,
        reservesOpenHoursBefore: patch.reservesOpenHoursBefore ?? reservesHours(group),
        guestsOpenHoursBefore:
          patch.guestsOpenHoursBefore === undefined
            ? group.guestsOpenHoursBefore
            : patch.guestsOpenHoursBefore,
      };
      assertLayers(layers);
      // GRP-45, 46: o mínimo não passa das vagas; o jogo atual que segue o grupo também é conferido.
      const slots = patch.slots ?? group.slots;
      const min = patch.minPlayers === undefined ? group.minPlayers : (patch.minPlayers ?? undefined);
      if (min !== undefined && min > slots) throw appError('GROUP_MIN_PLAYERS_INVALID', { max: slots });
      const capacityChanged = patch.slots !== undefined || patch.minPlayers !== undefined;
      const plan = capacityChanged ? await games.defaultsPlan(group, slots) : undefined;
      // Grava as reservas efetivas: grupo de antes da E2 deixa de depender do padrão (D3).
      const updated = await deps.groups.update(groupId, {
        ...patch,
        reservesOpenHoursBefore: layers.reservesOpenHoursBefore,
      });
      await plan?.afterUpdate(updated, userId);
      return forViewer(updated, userId, role, staffRoleId);
    },

    /** Gera outro link do tipo: o anterior deixa de valer (D9 do 003, D5 do 007). */
    async rotateInvite(userId: UserId, groupId: string, kind: InviteKind = 'member'): Promise<Invite> {
      const { group } = await requirePermission(deps, userId, groupId, 'members.manage');
      requireActive(group);
      if (kind === 'guest' && group.guestsOpenHoursBefore == null) throw appError('GAME_LINK_INVALID');
      const token = randomToken();
      await deps.groups.rotateToken(group, kind, token);
      return { kind, token };
    },

    /** Entra pelo link de membro ou de reserva (D5). Já participa → só sobe de reserva para membro. */
    async acceptInvite(userId: UserId, token: string): Promise<Group> {
      const found = await deps.groups.getByToken(token);
      if (!found || found.kind === 'guest') throw appError('GROUP_INVITE_INVALID');
      await attemptJoin(found.group, userId, found.kind, 1);
      const membership = await deps.groups.getMembership(found.group.id, userId);
      return forViewer(found.group, userId, membership?.role ?? found.kind, membership?.staffRoleId);
    },

    async members(userId: UserId, groupId: string): Promise<Member[]> {
      return (await memberRecords(userId, groupId)).map(publicMember);
    },

    memberRecords,

    /**
     * D12 do 003 / D10 do 007: tira o acesso, troca o link do papel e (com a lista aberta) a vaga; depois, promoção.
     * GRP-25, 53: com `members.manage`; o dono nunca sai, a si mesmo não, e quem tem cargo só o dono remove.
     */
    async removeMember(userId: UserId, groupId: string, target: PublicUserId): Promise<void> {
      const { group } = await requirePermission(deps, userId, groupId, 'members.manage');
      requireActive(group);
      const memberId = await resolveTarget(target);
      if (memberId === group.ownerId) throw appError('GROUP_OWNER_NOT_REMOVABLE');
      if (memberId === userId) throw selfTargetError('Use leave to exit the group');
      const membership = await deps.groups.getMembership(groupId, memberId);
      if (!membership) throw appError('GROUP_MEMBER_NOT_FOUND');
      if (staffRoleOf(membership.staffRoleId) && userId !== group.ownerId) throw appError('GROUP_NOT_OWNER');
      await attemptRemoval(group, memberId, membership.role, 1, true);
    },
    /** GRP-42: membro ou reserva sai sozinho; como a remoção, mas sem trocar o link. */
    async leave(userId: UserId, groupId: string): Promise<void> {
      const { group, role } = await requireMember(deps, userId, groupId);
      requireActive(group);
      if (userId === group.ownerId) throw appError('GROUP_OWNER_NOT_REMOVABLE');
      await attemptRemoval(group, userId, role, 1, false);
    },

    /** GRP-40: quem tem `members.manage` convida uma reserva para virar membro. Convite vigente → o mesmo, sem avisar. */
    async inviteToMember(userId: UserId, groupId: string, target: PublicUserId): Promise<MemberInvite> {
      const { group } = await requirePermission(deps, userId, groupId, 'members.manage');
      requireActive(group);
      const reserveId = await resolveTarget(target);
      const membership = await deps.groups.getMembership(groupId, reserveId);
      if (membership?.role !== 'reserve') throw appError('GROUP_MEMBER_NOT_FOUND');
      const pending = pendingInvite(membership.memberInviteExpiresAt);
      if (pending) return { userId: target, expiresAt: pending };
      const { memberCount } = await deps.groups.counts(groupId);
      if (memberCount >= limitsOf(group).maxMembers) throw appError('GROUP_MEMBERS_FULL');
      const expiresAt = new Date(now().getTime() + MEMBER_INVITE_DAYS * DAY_MS).toISOString();
      if ((await deps.groups.setMemberInvite(groupId, reserveId, expiresAt)) === 'not_reserve')
        throw appError('GROUP_MEMBER_NOT_FOUND');
      await deps.notifications.notify(reserveId, {
        type: 'member_invite',
        title: 'Convite para ser membro',
        body: `Você foi convidado para ser membro de ${group.name}.`,
        link: `/groups/${groupId}`,
      });
      return { userId: target, expiresAt };
    },

    /** GRP-40: quem tem `members.manage` cancela o convite pendente. Sem convite, não faz nada. */
    async cancelMemberInvite(userId: UserId, groupId: string, target: PublicUserId): Promise<void> {
      const { group } = await requirePermission(deps, userId, groupId, 'members.manage');
      requireActive(group);
      await deps.groups.clearMemberInvite(groupId, await resolveTarget(target));
    },

    /** GRP-41: a reserva aceita; o prazo e o limite são conferidos na gravação. */
    async acceptMemberInvite(userId: UserId, groupId: string): Promise<Group> {
      const { group, role, staffRoleId } = await requireMember(deps, userId, groupId);
      requireActive(group);
      if (role !== 'reserve') throw appError('GROUP_MEMBER_INVITE_INVALID');
      const promoted = await attemptAccept(group, userId, 1);
      // GRP-48: virar membro não muda o cargo.
      return forViewer(promoted, userId, 'member', staffRoleId);
    },

    /** GRP-41: a reserva recusa; o convite some e o dono não é avisado. */
    async declineMemberInvite(userId: UserId, groupId: string): Promise<void> {
      const { group } = await requireMember(deps, userId, groupId);
      requireActive(group);
      const membership = await deps.groups.getMembership(groupId, userId);
      if (membership?.role !== 'reserve' || !pendingInvite(membership.memberInviteExpiresAt))
        throw appError('GROUP_MEMBER_INVITE_INVALID');
      await deps.groups.clearMemberInvite(groupId, userId);
    },

    /** GRP-51: o dono dá o cargo. Quem já tem o mesmo não muda e não é avisado. */
    async setStaffRole(
      ownerId: UserId,
      groupId: string,
      target: PublicUserId,
      staffRoleId: StaffRoleId,
    ): Promise<void> {
      const { group, membership, userId } = await staffTarget(ownerId, groupId, target);
      if (membership.staffRoleId === staffRoleId) return;
      if ((await deps.groups.setStaffRole(groupId, userId, staffRoleId)) === 'not_member')
        throw appError('GROUP_MEMBER_NOT_FOUND');
      const role = staffRoleOf(staffRoleId);
      await deps.notifications.notify(userId, {
        type: 'staff_role_granted',
        title: `Você agora é ${role?.name ?? staffRoleId}`,
        body: `Você recebeu o cargo ${role?.name ?? staffRoleId} em ${group.name}.`,
        link: `/groups/${groupId}`,
      });
    },

    /** GRP-51: o dono tira o cargo. Sem cargo, não faz nada; ninguém é avisado. */
    async clearStaffRole(ownerId: UserId, groupId: string, target: PublicUserId): Promise<void> {
      const { membership, userId } = await staffTarget(ownerId, groupId, target);
      if (membership.staffRoleId === undefined) return;
      if ((await deps.groups.setStaffRole(groupId, userId, null)) === 'not_member')
        throw appError('GROUP_MEMBER_NOT_FOUND');
    },

    /** GRP-54: o dono passa o grupo para um membro e continua como Admin. */
    async transfer(ownerId: UserId, groupId: string, target: PublicUserId): Promise<Group> {
      const group = await requireOwner(deps, ownerId, groupId);
      requireActive(group);
      const userId = await resolveTarget(target);
      if (userId === ownerId) throw selfTargetError('The owner already owns the group');
      const membership = await deps.groups.getMembership(groupId, userId);
      if (membership?.role !== 'member') throw appError('GROUP_MEMBER_NOT_FOUND');
      const result = await deps.groups.transfer({ group, from: ownerId, to: userId, toPublicId: target });
      if (result === 'not_member') throw appError('GROUP_MEMBER_NOT_FOUND');
      if (result === 'stale') {
        // Releu: arquivado no meio (GRP-32) ou o grupo já mudou de dono.
        const fresh = await deps.groups.get(groupId, { consistent: true });
        if (!fresh) throw appError('GROUP_NOT_FOUND');
        requireActive(fresh);
        throw appError('GROUP_NOT_OWNER');
      }
      await deps.notifications.notify(userId, {
        type: 'group_transferred',
        title: 'Você agora é o dono do grupo',
        body: `Você recebeu o grupo ${group.name}.`,
        link: `/groups/${groupId}`,
      });
      return forViewer({ ...group, ownerId: userId, ownerPublicId: target }, ownerId, 'member', 'admin');
    },
  };
}
export type GroupService = ReturnType<typeof createGroupService>;
