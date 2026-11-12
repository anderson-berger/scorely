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
  type UpdateGroupInput,
} from '@scorely/contracts';
import { randomToken } from '../../lib/crypto';
import { newEntity } from '../../lib/entity';
import { appError } from '../../lib/errors';
import { createGameService } from './game.service';
import { type GroupMember, limitsOf, type StoredGroup } from './group.repository';
import {
  forViewer,
  type GroupsDeps,
  requireActive,
  requireMember,
  requireOwner,
  reservesHours,
} from './groups.deps';

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

export function createGroupService(deps: GroupsDeps) {
  const now = deps.now ?? (() => new Date());
  const games = createGameService(deps);

  /** Uma tentativa da remoção (D12 do 003); `stale` → relê o grupo e o plano e tenta de novo. */
  async function attemptRemoval(
    group: StoredGroup,
    memberId: string,
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
    userId: string,
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
  async function attemptAccept(group: StoredGroup, userId: string, attempt: number): Promise<StoredGroup> {
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

  return {
    async create(ownerId: string, input: CreateGroupInput): Promise<Group> {
      const layers = createLayers(input);
      assertLayers({ ...input, ...layers });
      const owner = await deps.users.get(ownerId);
      const group = newEntity<StoredGroup>(
        {
          ...input,
          ...layers,
          ...CREATE_LIMITS,
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
      const view = forViewer(group, userId, role);
      if (role !== 'reserve') return view;
      // GRP-40, 41: a reserva com convite pendente vê o prazo para aceitar ou recusar.
      const expiresAt = pendingInvite(
        (await deps.groups.getMembership(groupId, userId))?.memberInviteExpiresAt,
      );
      return expiresAt ? { ...view, myMemberInvite: { expiresAt } } : view;
    },

    async myGroups(userId: string): Promise<MyGroup[]> {
      // Plano 013, D7: grupo e papel numa leitura só (Query + BatchGet), sem get/roleOf por grupo.
      // GRP-31: arquivado sai daqui e vai para `archivedGroups`.
      const rows = (await deps.groups.groupsOf(userId)).filter(({ group }) => !group.archivedAt);
      return Promise.all(
        rows.map(async ({ group, role }) => ({
          ...forViewer(group, userId, role),
          game: await games.summary(userId, group),
        })),
      );
    },

    /** GRP-31: só os arquivados, do arquivado mais recente para o mais antigo, sem o resumo do jogo. */
    async archivedGroups(userId: string): Promise<Group[]> {
      const rows = await deps.groups.groupsOf(userId);
      return rows
        .flatMap(({ group, role }) => (group.archivedAt ? [{ group, role, at: group.archivedAt }] : []))
        .sort((a, b) => b.at.localeCompare(a.at))
        .map(({ group, role }) => forViewer(group, userId, role));
    },

    /** GRP-31: arquiva (links param na hora) e cancela o jogo aberto. Arquivar de novo só completa o cancelamento. */
    async archive(userId: string, groupId: string): Promise<Group> {
      const group = await requireOwner(deps, userId, groupId);
      const archived = await attemptArchive(group, 1);
      await games.cancelForArchive(archived);
      return forViewer(archived, userId, 'member');
    },

    /** GRP-33: volta com 3 links novos. Grupo ativo → devolve como está. */
    async unarchive(userId: string, groupId: string): Promise<Group> {
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

    /** D11: o dono muda as camadas. Junta com o atual e confere a ordem antes de gravar. */
    async update(userId: string, groupId: string, patch: UpdateGroupInput): Promise<Group> {
      const group = await requireOwner(deps, userId, groupId);
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
      await plan?.afterUpdate(updated);
      return forViewer(updated, userId, 'member');
    },

    /** Gera outro link do tipo: o anterior deixa de valer (D9 do 003, D5 do 007). */
    async rotateInvite(userId: string, groupId: string, kind: InviteKind = 'member'): Promise<Invite> {
      const group = await requireOwner(deps, userId, groupId);
      requireActive(group);
      if (kind === 'guest' && group.guestsOpenHoursBefore == null) throw appError('GAME_LINK_INVALID');
      const token = randomToken();
      await deps.groups.rotateToken(group, kind, token);
      return { kind, token };
    },

    /** Entra pelo link de membro ou de reserva (D5). Já participa → só sobe de reserva para membro. */
    async acceptInvite(userId: string, token: string): Promise<Group> {
      const found = await deps.groups.getByToken(token);
      if (!found || found.kind === 'guest') throw appError('GROUP_INVITE_INVALID');
      await attemptJoin(found.group, userId, found.kind, 1);
      const role = (await deps.groups.roleOf(found.group.id, userId)) ?? found.kind;
      return forViewer(found.group, userId, role);
    },

    /** Dono no topo, depois os membros e por último as reservas; dentro de cada papel, por data de entrada (D9 do 013). */
    async members(userId: string, groupId: string): Promise<Member[]> {
      const { group } = await requireMember(deps, userId, groupId);
      const list = await deps.groups.listMembers(groupId);
      const users = new Map((await deps.users.getMany(list.map((m) => m.userId))).map((u) => [u.id, u]));
      const isOwner = (id: string) => id === group.ownerId;
      const rank = (m: GroupMember) => (isOwner(m.userId) ? -1 : ROLE_ORDER[m.role]);
      const ordered = [...list].sort((a, b) => rank(a) - rank(b) || a.createdAt.localeCompare(b.createdAt));
      const viewerIsOwner = isOwner(userId);
      return ordered.map(({ userId: id, role, memberInviteExpiresAt }): Member => {
        const user = users.get(id);
        const name = user?.nickname ?? user?.name;
        // GRP-40: só o dono vê o prazo do convite pendente.
        const invite = viewerIsOwner ? pendingInvite(memberInviteExpiresAt) : undefined;
        return {
          userId: id,
          ...(name && { name }),
          isOwner: isOwner(id),
          role,
          ...(invite && { memberInviteExpiresAt: invite }),
        };
      });
    },

    /** D12 do 003 / D10 do 007: tira o acesso, troca o link do papel e (com a lista aberta) a vaga; depois, promoção. */
    async removeMember(userId: string, groupId: string, memberId: string): Promise<void> {
      const group = await requireOwner(deps, userId, groupId);
      requireActive(group);
      if (memberId === group.ownerId) throw appError('GROUP_OWNER_NOT_REMOVABLE');
      const role = await deps.groups.roleOf(groupId, memberId);
      if (!role) throw appError('GROUP_MEMBER_NOT_FOUND');
      await attemptRemoval(group, memberId, role, 1, true);
    },

    /** GRP-42: membro ou reserva sai sozinho; como a remoção, mas sem trocar o link. */
    async leave(userId: string, groupId: string): Promise<void> {
      const { group, role } = await requireMember(deps, userId, groupId);
      requireActive(group);
      if (userId === group.ownerId) throw appError('GROUP_OWNER_NOT_REMOVABLE');
      await attemptRemoval(group, userId, role, 1, false);
    },

    /** GRP-40: o dono convida uma reserva para virar membro. Convite vigente → devolve o mesmo, sem avisar. */
    async inviteToMember(ownerId: string, groupId: string, userId: string): Promise<MemberInvite> {
      const group = await requireOwner(deps, ownerId, groupId);
      requireActive(group);
      const membership = await deps.groups.getMembership(groupId, userId);
      if (membership?.role !== 'reserve') throw appError('GROUP_MEMBER_NOT_FOUND');
      const pending = pendingInvite(membership.memberInviteExpiresAt);
      if (pending) return { userId, expiresAt: pending };
      const { memberCount } = await deps.groups.counts(groupId);
      if (memberCount >= limitsOf(group).maxMembers) throw appError('GROUP_MEMBERS_FULL');
      const expiresAt = new Date(now().getTime() + MEMBER_INVITE_DAYS * DAY_MS).toISOString();
      if ((await deps.groups.setMemberInvite(groupId, userId, expiresAt)) === 'not_reserve')
        throw appError('GROUP_MEMBER_NOT_FOUND');
      await deps.notifications.notify(userId, {
        type: 'member_invite',
        title: 'Convite para ser membro',
        body: `Você foi convidado para ser membro de ${group.name}.`,
        link: `/groups/${groupId}`,
      });
      return { userId, expiresAt };
    },

    /** GRP-40: o dono cancela o convite pendente. Sem convite, não faz nada. */
    async cancelMemberInvite(ownerId: string, groupId: string, userId: string): Promise<void> {
      const group = await requireOwner(deps, ownerId, groupId);
      requireActive(group);
      await deps.groups.clearMemberInvite(groupId, userId);
    },

    /** GRP-41: a reserva aceita; o prazo e o limite são conferidos na gravação. */
    async acceptMemberInvite(userId: string, groupId: string): Promise<Group> {
      const { group, role } = await requireMember(deps, userId, groupId);
      requireActive(group);
      if (role !== 'reserve') throw appError('GROUP_MEMBER_INVITE_INVALID');
      const promoted = await attemptAccept(group, userId, 1);
      return forViewer(promoted, userId, 'member');
    },

    /** GRP-41: a reserva recusa; o convite some e o dono não é avisado. */
    async declineMemberInvite(userId: string, groupId: string): Promise<void> {
      const { group } = await requireMember(deps, userId, groupId);
      requireActive(group);
      const membership = await deps.groups.getMembership(groupId, userId);
      if (membership?.role !== 'reserve' || !pendingInvite(membership.memberInviteExpiresAt))
        throw appError('GROUP_MEMBER_INVITE_INVALID');
      await deps.groups.clearMemberInvite(groupId, userId);
    },
  };
}
export type GroupService = ReturnType<typeof createGroupService>;
