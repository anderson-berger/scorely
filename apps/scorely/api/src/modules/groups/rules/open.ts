// Grupo aberto: o modo de entrada, a apresentação e os pedidos para entrar (GRV-25–28).
import { appError } from '@scorely/api/src/lib/errors';
import type { GroupId, UserId } from '@scorely/api/src/lib/ids';
import {
  requestExpiresAt,
  type StoredGroup,
  type StoredJoinRequest,
  type StoredMembership,
} from '@scorely/api/src/modules/groups/data/groups.repository';
import { forViewer, type GroupContext } from '@scorely/api/src/modules/groups/rules/groups';
import { permissionsOf, requirePermission } from '@scorely/api/src/modules/groups/rules/permissions';
import {
  type ApproveGroupRequestInput,
  GROUP_PARTICIPANT_MAX,
  type Group,
  type GroupJoinRequest,
  type GroupPreview,
  type PublicGroupId,
  type PublicUserId,
  type SetGroupJoinModeInput,
} from '@scorely/contracts';

/** GRV-27: o pedido que não venceu. O vencido conta como se não existisse. */
const isLive = (request: StoredJoinRequest, now: Date) => request.expiresAt > now.toISOString();

export function openRules(ctx: GroupContext) {
  const { deps, now, urlOf, access, profiles } = ctx;

  /** GRV-25: quem tem `group.edit` muda o modo de entrada, com a `version` conferida (ADR 0016). */
  async function setJoinMode(
    userId: UserId,
    publicId: PublicGroupId,
    input: SetGroupJoinModeInput,
  ): Promise<Group> {
    const { id, membership, roles } = await access(userId, publicId);
    requirePermission(membership, roles, 'group.edit');
    await deps.groups.setJoinMode(id, input.mode, input.expectedVersion, now());
    const group = await deps.groups.get(id, { consistent: true });
    if (!group) throw appError('GROUP_NOT_FOUND');
    return forViewer(group, membership, roles, deps.media?.urlOf);
  }

  /** O grupo aberto pelo código; o de convite, ou um código que não existe, é `GROUP_NOT_FOUND` (GRV-26, 27). */
  async function openGroup(publicId: PublicGroupId): Promise<StoredGroup> {
    const id = await deps.groups.resolve(publicId);
    const group = id === undefined ? undefined : await deps.groups.get(id);
    if (group?.joinMode !== 'open') throw appError('GROUP_NOT_FOUND');
    return group;
  }

  async function previewOf(
    group: StoredGroup,
    membership: StoredMembership | undefined,
    request: StoredJoinRequest | undefined,
  ): Promise<GroupPreview> {
    return {
      groupId: group.publicId,
      name: group.name,
      ...(group.logoMediaId !== undefined && { logoUrl: urlOf('group.logo', group.logoMediaId) }),
      ...(group.coverMediaId !== undefined && { coverUrl: urlOf('group.cover', group.coverMediaId) }),
      participants: await deps.groups.countParticipants(group.id),
      ...(membership && { myTier: membership.tier }),
      ...(request && { requestedAt: request.createdAt }),
    };
  }

  /** GRV-26: a apresentação do grupo aberto, com a participação ou o pedido de quem pede. */
  async function preview(userId: UserId, publicId: PublicGroupId): Promise<GroupPreview> {
    const group = await openGroup(publicId);
    const [membership, request] = await Promise.all([
      deps.groups.getMembership(group.id, userId),
      liveRequest(group.id, userId),
    ]);
    return previewOf(group, membership, request);
  }

  /** GRV-27: o pedido da pessoa, se há um que não venceu (o `ttl` atrasa, ADR 0004). */
  async function liveRequest(
    groupId: GroupId,
    userId: UserId,
    opts?: { consistent?: boolean },
  ): Promise<StoredJoinRequest | undefined> {
    const found = await deps.groups.getRequest(groupId, userId, opts);
    return found && isLive(found, now()) ? found : undefined;
  }

  /** GRV-27: pede para entrar; pedir de novo não muda nada nem avisa de novo. */
  async function request(userId: UserId, publicId: PublicGroupId): Promise<GroupPreview> {
    const group = await openGroup(publicId);
    const [membership, existing] = await Promise.all([
      deps.groups.getMembership(group.id, userId),
      liveRequest(group.id, userId),
    ]);
    if (membership) {
      throw appError('VALIDATION_ERROR', {
        issues: [{ code: 'custom', path: [], message: 'You already participate in this group' }],
      });
    }
    if (existing) return previewOf(group, undefined, existing);
    const createdAt = now().toISOString();
    const created: StoredJoinRequest = {
      groupId: group.id,
      userId,
      createdAt,
      expiresAt: requestExpiresAt(createdAt),
    };
    if (!(await deps.groups.putRequest(created))) {
      // Outro pedido da mesma pessoa entrou antes: vale o dele, e quem avisou foi ele.
      const current = await liveRequest(group.id, userId, { consistent: true });
      return previewOf(group, undefined, current ?? created);
    }
    await notifyRequest(group, userId);
    return previewOf(group, undefined, created);
  }

  /** GRV-27: o aviso vai para quem pode aceitar (`members.invite`, GRV-15). */
  async function notifyRequest(group: StoredGroup, requesterId: UserId): Promise<void> {
    const [list, people, roles] = await Promise.all([
      deps.groups.listMembers(group.id),
      profiles([requesterId]),
      deps.groups.getRoles(group.id),
    ]);
    const nickname = people.get(requesterId)?.nickname;
    const admins = list.filter((m) => permissionsOf(m, roles).includes('members.invite'));
    await Promise.all(
      admins.map((m) =>
        deps.notifications.notify(m.userId, {
          type: 'group_join_requested',
          title: 'Pedido para entrar',
          body: `${nickname ?? 'Alguém'} pediu para entrar em ${group.name}.`,
          link: `/groups/${group.publicId}/members`,
        }),
      ),
    );
  }

  /** GRV-27: a pessoa cancela o próprio pedido, em qualquer modo; sem pedido, nada muda. */
  async function cancelRequest(userId: UserId, publicId: PublicGroupId): Promise<void> {
    const id = await deps.groups.resolve(publicId);
    if (id === undefined) throw appError('GROUP_NOT_FOUND');
    await deps.groups.deleteRequest(id, userId);
  }

  /** GRV-28: os pedidos do grupo, do mais antigo para o mais novo, com o perfil. */
  async function listRequests(userId: UserId, publicId: PublicGroupId): Promise<GroupJoinRequest[]> {
    const { id, membership, roles } = await access(userId, publicId);
    requirePermission(membership, roles, 'members.invite');
    const at = now();
    const list = (await deps.groups.listRequests(id))
      .filter((r) => isLive(r, at))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const people = await profiles(list.map((r) => r.userId));
    // Uma conta que sumiu (AUTH-16) não tem perfil: o pedido dela não aparece.
    return list.flatMap((r) => {
      const user = people.get(r.userId);
      return user ? [{ user, createdAt: r.createdAt }] : [];
    });
  }

  /** Quem administra e o uuid da pessoa do pedido; id público desconhecido → `GROUP_REQUEST_NOT_FOUND` (GRV-28). */
  async function requestTarget(userId: UserId, publicId: PublicGroupId, targetPublicId: PublicUserId) {
    const { id, group, membership, roles } = await access(userId, publicId);
    requirePermission(membership, roles, 'members.invite');
    const targetId = (await deps.users.resolve([targetPublicId])).get(targetPublicId);
    if (targetId === undefined) throw appError('GROUP_REQUEST_NOT_FOUND');
    return { id, group, targetId };
  }

  /** GRV-28: aceita como membro ou reserva; quem já participa (entrou por convite) não muda nem é avisado. */
  async function approveRequest(
    userId: UserId,
    publicId: PublicGroupId,
    targetPublicId: PublicUserId,
    input: ApproveGroupRequestInput,
  ): Promise<void> {
    const { id, group, targetId } = await requestTarget(userId, publicId, targetPublicId);
    const result = await deps.groups.approveRequest({
      groupId: id,
      userId: targetId,
      tier: input.tier,
      now: now(),
    });
    if (result === 'request_gone') throw appError('GROUP_REQUEST_NOT_FOUND');
    if (result === 'group_full') throw appError('GROUP_FULL', { limit: GROUP_PARTICIPANT_MAX });
    if (result === 'already_member') return;
    await deps.notifications.notify(targetId, {
      type: 'group_join_approved',
      title: 'Pedido aceito',
      body: `Você entrou em ${group.name}.`,
      link: `/groups/${group.publicId}`,
    });
  }

  /** GRV-28: recusa sem aviso; a pessoa pode pedir de novo. */
  async function declineRequest(
    userId: UserId,
    publicId: PublicGroupId,
    targetPublicId: PublicUserId,
  ): Promise<void> {
    const { id, targetId } = await requestTarget(userId, publicId, targetPublicId);
    if (!(await deps.groups.deleteRequest(id, targetId, { mustExist: true }))) {
      throw appError('GROUP_REQUEST_NOT_FOUND');
    }
  }

  return {
    setJoinMode,
    preview,
    request,
    cancelRequest,
    listRequests,
    approveRequest,
    declineRequest,
  };
}
