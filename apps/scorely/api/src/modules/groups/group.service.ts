import { randomToken } from '@scorely/api/src/lib/crypto';
import { newEntity } from '@scorely/api/src/lib/entity';
import { appError } from '@scorely/api/src/lib/errors';
import type { UserId } from '@scorely/api/src/lib/ids';
import { createGameService } from '@scorely/api/src/modules/groups/game.service';
import type { GroupMember, StoredGroup } from '@scorely/api/src/modules/groups/group.repository';
import {
  forViewer,
  type GroupsDeps,
  permissionsOf,
  requireActive,
  requireMember,
  requireOwner,
  requirePermission,
  roleIdOf,
  type SportsDep,
} from '@scorely/api/src/modules/groups/groups.deps';
import { publicMember, type RosterMember } from '@scorely/api/src/modules/groups/roster';
import type { StoredSchedule } from '@scorely/api/src/modules/groups/schedule.repository';
import {
  type CreateGroupInput,
  type GrantableRoleId,
  type Group,
  GroupLayersSchema,
  type Invite,
  type InviteKind,
  type Member,
  type MemberInvite,
  type MemberTier,
  type MyGroup,
  type PublicUserId,
  type RoleId,
  type UpdateGroupInput,
  UpdateGroupInputSchema,
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

const TIER_ORDER: Record<MemberTier, number> = { member: 0, reserve: 1 };

/** O nome do cargo nos avisos (o título ainda sai em português do back, ver scorely-api.md). */
const ROLE_NAMES: Record<RoleId, string> = { owner: 'Dono', admin: 'Admin', member: 'Membro' };

/** `VALIDATION_ERROR` de uma ação sobre a própria pessoa que não cabe (GRP-25, 51, 54). */
function selfTargetError(message: string) {
  return appError('VALIDATION_ERROR', { issues: [{ code: 'custom', path: ['userId'], message }] });
}

export function createGroupService(deps: GroupsDeps & SportsDep) {
  const now = deps.now ?? (() => new Date());
  /** O grupo para quem pede (`forViewer`), com as URLs das imagens pela mídia dos deps (MID-12). */
  const viewFor = (group: StoredGroup, tier: MemberTier, roleId: string | undefined): Group =>
    forViewer(group, tier, roleId, deps.media?.urlOf);
  const games = createGameService(deps);

  /** Uma tentativa da remoção (D12 do 003); `stale` → relê o grupo e o plano e tenta de novo. */
  async function attemptRemoval(
    group: StoredGroup,
    memberId: UserId,
    tier: MemberTier,
    attempt: number,
    rotate: boolean,
  ): Promise<void> {
    const plan = await games.removalPlan(group, memberId);
    const result = await deps.groups.removeMember({
      group,
      userId: memberId,
      tier,
      // GRP-42: quem sai não está sendo bloqueado, então o link não muda.
      ...(rotate && { newToken: randomToken() }),
      players: plan.players,
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
    tier: MemberTier,
    attempt: number,
  ): Promise<void> {
    const result = await deps.groups.addMember(group, userId, tier);
    if (result === 'members_full') throw appError('GROUP_MEMBERS_FULL');
    if (result === 'reserves_full') throw appError('GROUP_RESERVES_FULL');
    if (result !== 'stale') return;
    if (attempt >= JOIN_ATTEMPTS) throw new Error('Group join kept conflicting with other writes');
    const fresh = await deps.groups.get(group.id, { consistent: true });
    // Arquivado no meio: o link deixou de valer (GRP-31).
    if (!fresh || fresh.archivedAt) throw appError('GROUP_INVITE_INVALID');
    return attemptJoin(fresh, userId, tier, attempt + 1);
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
    const { roleId: viewerRoleId } = await requireMember(deps, userId, groupId);
    const list = await deps.groups.listMembers(groupId);
    const users = new Map((await deps.users.getMany(list.map((m) => m.userId))).map((u) => [u.id, u]));

    const rank = (m: GroupMember) => (m.roleId === 'owner' ? -1 : TIER_ORDER[m.tier]);
    const ordered = [...list].sort((a, b) => rank(a) - rank(b) || a.createdAt.localeCompare(b.createdAt));
    // GRP-40: só quem cuida dos membros vê o prazo do convite pendente.
    const viewerManages = permissionsOf(viewerRoleId).includes('members.manage');
    return ordered.map(({ userId: id, tier, roleId, memberInviteExpiresAt }): RosterMember => {
      const user = users.get(id);
      if (!user) throw new Error('Member without a user profile');
      const invite = viewerManages ? pendingInvite(memberInviteExpiresAt) : undefined;
      // GRP-55: o papel e o cargo são de todos verem.
      return {
        userId: id,
        publicId: user.publicId,
        nickname: user.nickname,
        tier,
        roleId: roleIdOf(roleId),
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
    if (userId === ownerId) throw selfTargetError('The owner role only changes by transferring the group');
    const membership = await deps.groups.getMembership(groupId, userId);
    if (!membership) throw appError('GROUP_MEMBER_NOT_FOUND');
    return { group, membership, userId };
  }

  return {
    async create(ownerId: UserId, input: CreateGroupInput): Promise<Group> {
      const layers = createLayers(input);
      assertLayers({ ...input, ...layers });
      // GRP-58: um esporte do catálogo e ativo (o desativado continua só para quem já tem, ESP-05).
      const sport = await deps.sports.get(input.sportId);
      if (!sport?.active) throw appError('SPORT_NOT_FOUND', { sportId: input.sportId });
      // GRP-13: sem fuso no pedido, o das preferências do dono (USR-07).
      const preferences = await deps.users.getPreferences(ownerId);
      const timeZone = input.timeZone ?? preferences.timeZone ?? DEFAULT_TIME_ZONE;
      const { weekday, start, end, ...groupInput } = input;
      const at = now();
      // GRP-64: o 1º horário, do form de criar.
      const firstSchedule = newEntity<Omit<StoredSchedule, 'version' | 'groupId'>>(
        { weekday, start, end, updatedAt: at.toISOString() },
        at,
      );
      const group = newEntity<StoredGroup>(
        {
          ...groupInput,
          ...layers,
          ...CREATE_LIMITS,
          timeZone,
          // ADR 0013: a identidade e os Ajustes nascem na versão 1 (GRP-59).
          version: 1,
          settingsVersion: 1,
          inviteToken: randomToken(),
          reserveInviteToken: randomToken(),
          guestToken: randomToken(),
          schedules: [],
        },
        at,
      );
      const schedule = { ...firstSchedule, groupId: group.id };
      // GRP-01, 48: o dono é a participação do criador, com o cargo `owner`. GRP-64: o 1º horário vai junto.
      await deps.groups.create(group, ownerId, schedule);
      return viewFor({ ...group, schedules: [{ ...schedule, version: 1 }] }, 'member', 'owner');
    },

    async get(userId: UserId, groupId: string): Promise<Group> {
      const { group, tier, roleId, memberInviteExpiresAt } = await requireMember(deps, userId, groupId);
      const view = viewFor(group, tier, roleId);
      if (tier !== 'reserve') return view;
      // GRP-40, 41: a reserva com convite pendente vê o prazo para aceitar ou recusar.
      const expiresAt = pendingInvite(memberInviteExpiresAt);
      return expiresAt ? { ...view, myMemberInvite: { expiresAt } } : view;
    },

    async myGroups(userId: UserId): Promise<MyGroup[]> {
      // Plano 013, D7: grupo e papel numa leitura só (Query + BatchGet), sem get/roleOf por grupo.
      // GRP-31: arquivado sai daqui e vai para `archivedGroups`.
      const rows = (await deps.groups.groupsOf(userId)).filter(({ group }) => !group.archivedAt);
      return Promise.all(
        rows.map(async ({ group, tier, roleId }) => ({
          ...viewFor(group, tier, roleId),
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
        .map(({ group, tier, roleId }) => viewFor(group, tier, roleId));
    },

    /** GRP-31: arquiva (links param na hora) e cancela o jogo aberto. Arquivar de novo só completa o cancelamento. */
    async archive(userId: UserId, groupId: string): Promise<Group> {
      const group = await requireOwner(deps, userId, groupId);
      const archived = await attemptArchive(group, 1);
      await games.cancelForArchive(archived, userId);
      return viewFor(archived, 'member', 'owner');
    },

    /** GRP-33: volta com 3 links novos. Grupo ativo → devolve como está. */
    async unarchive(userId: UserId, groupId: string): Promise<Group> {
      const group = await requireOwner(deps, userId, groupId);
      if (!group.archivedAt) return viewFor(group, 'member', 'owner');
      const tokens = {
        inviteToken: randomToken(),
        reserveInviteToken: randomToken(),
        guestToken: randomToken(),
      };
      if ((await deps.groups.unarchive(group, tokens)) === 'unarchived') {
        const { archivedAt: _a, ...rest } = group;
        return viewFor({ ...rest, ...tokens }, 'member', 'owner');
      }
      // Outra requisição desarquivou antes: devolve o grupo como ficou.
      const fresh = await deps.groups.get(groupId, { consistent: true });
      if (!fresh) throw appError('GROUP_NOT_FOUND');
      return viewFor(fresh, 'member', 'owner');
    },

    /** GRP-16: quem tem `settings.edit` muda as camadas. Junta com o atual e confere a ordem antes de gravar. */
    async update(userId: UserId, groupId: string, input: UpdateGroupInput): Promise<Group> {
      // GRP-16: só os campos do contrato; o resto (ex.: `sportId`, que não muda, GRP-58) não chega ao banco.
      const patch = UpdateGroupInputSchema.parse(input);
      const { group, tier, roleId } = await requirePermission(deps, userId, groupId, 'settings.edit');
      requireActive(group);
      const layers = {
        listOpensHoursBefore: patch.listOpensHoursBefore ?? group.listOpensHoursBefore,
        reservesOpenHoursBefore: patch.reservesOpenHoursBefore ?? group.reservesOpenHoursBefore,
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
      // GRP-62: o padrão é um lugar ativo do grupo (a gravação confere de novo).
      if (typeof patch.defaultPlaceId === 'string') {
        const place = await deps.places.get(groupId, patch.defaultPlaceId);
        if (!place || place.archivedAt) throw appError('PLACE_NOT_FOUND');
      }
      const capacityChanged = patch.slots !== undefined || patch.minPlayers !== undefined;
      const plan = capacityChanged ? await games.defaultsPlan(group, slots) : undefined;
      // GRP-59: grava só com a versão dos Ajustes que a tela mostrou.
      const { version, ...changes } = patch;
      const updated = await deps.groups.update(groupId, changes, version);
      await plan?.afterUpdate(updated, userId);
      return viewFor(updated, tier, roleId);
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
      return viewFor(found.group, membership?.tier ?? found.kind, membership?.roleId);
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
      const { group, roleId: removerRoleId } = await requirePermission(
        deps,
        userId,
        groupId,
        'members.manage',
      );
      requireActive(group);
      const memberId = await resolveTarget(target);
      const membership = await deps.groups.getMembership(groupId, memberId);
      if (membership?.roleId === 'owner') throw appError('GROUP_OWNER_NOT_REMOVABLE');
      if (memberId === userId) throw selfTargetError('Use leave to exit the group');
      if (!membership) throw appError('GROUP_MEMBER_NOT_FOUND');
      // GRP-53: quem tem um cargo de verdade (não o Membro) só o dono remove.
      if (roleIdOf(membership.roleId) !== 'member' && removerRoleId !== 'owner')
        throw appError('GROUP_NOT_OWNER');
      await attemptRemoval(group, memberId, membership.tier, 1, true);
    },
    /** GRP-42: membro ou reserva sai sozinho; como a remoção, mas sem trocar o link. */
    async leave(userId: UserId, groupId: string): Promise<void> {
      const { group, tier, roleId } = await requireMember(deps, userId, groupId);
      requireActive(group);
      if (roleId === 'owner') throw appError('GROUP_OWNER_NOT_REMOVABLE');
      await attemptRemoval(group, userId, tier, 1, false);
    },

    /** GRP-40: quem tem `members.manage` convida uma reserva para virar membro. Convite vigente → o mesmo, sem avisar. */
    async inviteToMember(userId: UserId, groupId: string, target: PublicUserId): Promise<MemberInvite> {
      const { group } = await requirePermission(deps, userId, groupId, 'members.manage');
      requireActive(group);
      const reserveId = await resolveTarget(target);
      if (reserveId === userId) throw selfTargetError('You cannot invite yourself');
      const membership = await deps.groups.getMembership(groupId, reserveId);
      if (membership?.tier !== 'reserve') throw appError('GROUP_MEMBER_NOT_FOUND');
      const pending = pendingInvite(membership.memberInviteExpiresAt);
      if (pending) return { userId: target, expiresAt: pending };
      const { memberCount } = await deps.groups.counts(groupId);
      if (memberCount >= group.maxMembers) throw appError('GROUP_MEMBERS_FULL');
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
      const { group, tier, roleId } = await requireMember(deps, userId, groupId);
      requireActive(group);
      if (tier !== 'reserve') throw appError('GROUP_MEMBER_INVITE_INVALID');
      const promoted = await attemptAccept(group, userId, 1);
      // GRP-48: virar membro não muda o cargo.
      return viewFor(promoted, 'member', roleId);
    },

    /** GRP-41: a reserva recusa; o convite some e o dono não é avisado. */
    async declineMemberInvite(userId: UserId, groupId: string): Promise<void> {
      const { group } = await requireMember(deps, userId, groupId);
      requireActive(group);
      const membership = await deps.groups.getMembership(groupId, userId);
      if (membership?.tier !== 'reserve' || !pendingInvite(membership.memberInviteExpiresAt))
        throw appError('GROUP_MEMBER_INVITE_INVALID');
      await deps.groups.clearMemberInvite(groupId, userId);
    },

    /** GRP-51: o dono dá o cargo. Quem já tem o mesmo não muda e não é avisado. */
    async setStaffRole(
      ownerId: UserId,
      groupId: string,
      target: PublicUserId,
      roleId: GrantableRoleId,
    ): Promise<void> {
      const { group, membership, userId } = await staffTarget(ownerId, groupId, target);
      if (membership.roleId === roleId) return;
      if ((await deps.groups.setStaffRole(groupId, userId, roleId)) === 'not_member')
        throw appError('GROUP_MEMBER_NOT_FOUND');
      await deps.notifications.notify(userId, {
        type: 'staff_role_granted',
        title: `Você agora é ${ROLE_NAMES[roleId]}`,
        body: `Você recebeu o cargo ${ROLE_NAMES[roleId]} em ${group.name}.`,
        link: `/groups/${groupId}`,
      });
    },

    /** GRP-51: o dono tira o Admin, e a pessoa volta ao cargo Membro. Já Membro, não faz nada; ninguém é avisado. */
    async clearStaffRole(ownerId: UserId, groupId: string, target: PublicUserId): Promise<void> {
      const { membership, userId } = await staffTarget(ownerId, groupId, target);
      if (roleIdOf(membership.roleId) === 'member') return;
      if ((await deps.groups.setStaffRole(groupId, userId, 'member')) === 'not_member')
        throw appError('GROUP_MEMBER_NOT_FOUND');
    },

    /** GRP-54: o dono passa o grupo para um membro e continua como Admin. */
    async transfer(ownerId: UserId, groupId: string, target: PublicUserId): Promise<Group> {
      const group = await requireOwner(deps, ownerId, groupId);
      requireActive(group);
      const userId = await resolveTarget(target);
      if (userId === ownerId) throw selfTargetError('The owner already owns the group');
      const membership = await deps.groups.getMembership(groupId, userId);
      if (membership?.tier !== 'member') throw appError('GROUP_MEMBER_NOT_FOUND');
      const result = await deps.groups.transfer({ group, from: ownerId, to: userId });
      if (result === 'not_member') throw appError('GROUP_MEMBER_NOT_FOUND');
      if (result === 'stale') {
        // Releu: arquivado no meio (GRP-32) ou o grupo já mudou de dono (outra transferência, GRP-54).
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
      return viewFor(group, 'member', 'admin');
    },
  };
}
export type GroupService = ReturnType<typeof createGroupService>;
