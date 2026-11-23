import { randomUUID } from 'node:crypto';
import { asGroupId, asUserId, type GroupId, type UserId } from '@scorely/api/src/lib/ids';
import {
  dynamoGroupRepository,
  type GroupRepository,
  type StoredGroup,
  type StoredInvite,
} from '@scorely/api/src/modules/groups/group.repository';
import { memoryGroups, pid } from '@scorely/api/src/modules/groups/groups.memory';
import { beforeAll, describe, expect, inject, it } from 'vitest';

// Suíte de contrato do GroupRepository (ADR 0019, etapa 1: create e transferGroup): a mesma bateria roda contra o
// repositório em memória e contra o DynamoDB Local. Ids sempre novos, sem limpar entre os testes.

const T0 = new Date('2026-11-23T10:00:00.000Z');
const newUser = (): UserId => asUserId(randomUUID());

function newGroup(publicId = randomUUID().slice(0, 8).toUpperCase()): StoredGroup {
  return {
    id: asGroupId(randomUUID()),
    publicId: pid(publicId),
    name: 'Pelada',
    joinMode: 'invite',
    createdAt: T0.toISOString(),
    updatedAt: T0.toISOString(),
    version: 1,
  };
}

function newInvite(groupId: GroupId, createdBy: UserId, overrides: Partial<StoredInvite> = {}): StoredInvite {
  return {
    id: randomUUID(),
    groupId,
    token: randomUUID(),
    createdBy,
    tier: 'member',
    uses: 0,
    createdAt: T0.toISOString(),
    updatedAt: T0.toISOString(),
    version: 1,
    ...overrides,
  };
}

/** Entra no grupo pelo próprio repositório (convite + entrar), para ter mais participações. */
async function addMember(
  repo: GroupRepository,
  groupId: GroupId,
  ownerId: UserId,
  tier: 'member' | 'reserve',
) {
  const userId = newUser();
  const invite = newInvite(groupId, ownerId, { tier });
  await repo.createInvite(invite);
  expect(await repo.joinByInvite({ invite, userId, action: 'join', now: T0 })).toBe('ok');
  return userId;
}

/** Grupo com o dono e uma pessoa que tem o cargo `role` (ou é reserva). */
async function groupWith(repo: GroupRepository, tier: 'member' | 'reserve', role?: string) {
  const group = newGroup();
  const ownerId = newUser();
  expect(await repo.create(group, ownerId)).toBe('created');
  const userId = await addMember(repo, group.id, ownerId, tier);
  if (role) expect(await repo.setMemberRole(group.id, userId, role)).toBe(true);
  return { group, ownerId, userId };
}

describe.each([
  { name: 'memória', make: () => memoryGroups().repo },
  { name: 'DynamoDB Local', make: () => dynamoGroupRepository, dynamo: true },
])('GroupRepository ($name)', ({ make, dynamo }) => {
  const repo = make();

  beforeAll(() => {
    if (!dynamo) return;
    process.env.TABLE_NAME = inject('dynamoTableName');
    process.env.DYNAMODB_ENDPOINT = inject('dynamoEndpoint');
    process.env.AWS_REGION = 'sa-east-1';
  });

  describe('create', () => {
    it('GRV-01: grava o grupo e o código público leva a ele', async () => {
      const group = newGroup();
      expect(await repo.create(group, newUser())).toBe('created');
      expect(await repo.resolve(group.publicId)).toBe(group.id);
      expect(await repo.get(group.id, { consistent: true })).toMatchObject({
        id: group.id,
        publicId: group.publicId,
        name: 'Pelada',
        joinMode: 'invite',
        version: 1,
      });
    });

    it('GRV-02: o dono participa como membro com o cargo owner, e o grupo nasce com os cargos fixos', async () => {
      const group = newGroup();
      const ownerId = newUser();
      await repo.create(group, ownerId);
      expect(await repo.getMembership(group.id, ownerId, { consistent: true })).toMatchObject({
        groupId: group.id,
        userId: ownerId,
        tier: 'member',
        role: 'owner',
      });
      expect(await repo.getRoles(group.id, { consistent: true })).toMatchObject({
        roles: [],
        everyonePermissions: [],
        version: 1,
      });
      expect(await repo.listMine(ownerId)).toHaveLength(1);
    });

    it('GRV-08: segundo create com o mesmo código público → public_id_taken, sem criar o grupo', async () => {
      const first = newGroup();
      await repo.create(first, newUser());
      const second = newGroup(first.publicId);
      const otherOwner = newUser();
      expect(await repo.create(second, otherOwner)).toBe('public_id_taken');
      expect(await repo.resolve(first.publicId)).toBe(first.id);
      expect(await repo.get(second.id, { consistent: true })).toBeUndefined();
      expect(await repo.getMembership(second.id, otherOwner, { consistent: true })).toBeUndefined();
    });
  });

  describe('transferGroup', () => {
    const roleOf = async (groupId: GroupId, userId: UserId) =>
      (await repo.getMembership(groupId, userId, { consistent: true }))?.role;

    it('GRV-49: o novo vira owner e o antigo recebe o cargo que o novo tinha', async () => {
      const { group, ownerId, userId } = await groupWith(repo, 'member', 'r1');
      const result = await repo.transferGroup({
        groupId: group.id,
        fromUserId: ownerId,
        toUserId: userId,
        toRole: 'r1',
        now: T0,
      });
      expect(result).toBe('ok');
      expect(await roleOf(group.id, userId)).toBe('owner');
      expect(await roleOf(group.id, ownerId)).toBe('r1');
    });

    it('GRV-49: quem tinha o cargo Todos passa o grupo e o antigo dono fica com o Todos', async () => {
      const { group, ownerId, userId } = await groupWith(repo, 'member');
      const result = await repo.transferGroup({
        groupId: group.id,
        fromUserId: ownerId,
        toUserId: userId,
        toRole: 'everyone',
        now: T0,
      });
      expect(result).toBe('ok');
      expect(await roleOf(group.id, userId)).toBe('owner');
      expect(await roleOf(group.id, ownerId)).toBe('everyone');
    });

    it('GRV-49: para uma reserva → conflict, e nada muda nas duas participações', async () => {
      const { group, ownerId, userId } = await groupWith(repo, 'reserve');
      const result = await repo.transferGroup({
        groupId: group.id,
        fromUserId: ownerId,
        toUserId: userId,
        toRole: 'everyone',
        now: T0,
      });
      expect(result).toBe('conflict');
      expect(await roleOf(group.id, ownerId)).toBe('owner');
      expect(await roleOf(group.id, userId)).toBe('everyone');
      expect((await repo.getMembership(group.id, userId, { consistent: true }))?.tier).toBe('reserve');
    });

    it('GRV-49: o cargo do novo mudou desde a leitura → conflict, e nada muda', async () => {
      const { group, ownerId, userId } = await groupWith(repo, 'member', 'r2');
      const result = await repo.transferGroup({
        groupId: group.id,
        fromUserId: ownerId,
        toUserId: userId,
        toRole: 'r1',
        now: T0,
      });
      expect(result).toBe('conflict');
      expect(await roleOf(group.id, ownerId)).toBe('owner');
      expect(await roleOf(group.id, userId)).toBe('r2');
    });

    it('GRV-49: o antigo já não é owner → conflict, e nada muda', async () => {
      const { group, ownerId, userId } = await groupWith(repo, 'member', 'r1');
      const third = await addMember(repo, group.id, ownerId, 'member');
      // `userId` já não é owner: quem passa é ele, e a corrida é a passagem anterior ter acontecido.
      expect(
        await repo.transferGroup({
          groupId: group.id,
          fromUserId: ownerId,
          toUserId: third,
          toRole: 'everyone',
          now: T0,
        }),
      ).toBe('ok');
      const result = await repo.transferGroup({
        groupId: group.id,
        fromUserId: ownerId,
        toUserId: userId,
        toRole: 'r1',
        now: T0,
      });
      expect(result).toBe('conflict');
      expect(await roleOf(group.id, third)).toBe('owner');
      expect(await roleOf(group.id, ownerId)).toBe('everyone');
      expect(await roleOf(group.id, userId)).toBe('r1');
    });
  });

  describe('joinByInvite', () => {
    const ttlOf = (now: Date) => Math.floor(now.getTime() / 1000) + 30 * 24 * 60 * 60;
    const setup = async () => {
      const group = newGroup();
      const ownerId = newUser();
      await repo.create(group, ownerId);
      return { group, ownerId };
    };
    const issue = async (groupId: GroupId, ownerId: UserId, overrides: Partial<StoredInvite> = {}) => {
      const invite = newInvite(groupId, ownerId, overrides);
      await repo.createInvite(invite);
      return invite;
    };
    const members = async (groupId: GroupId, userId: UserId) =>
      repo.getMembership(groupId, userId, { consistent: true });

    it('GRV-22: join grava a participação, soma o uso e o convite, e o grupo aparece em listMine', async () => {
      const { group, ownerId } = await setup();
      const invite = await issue(group.id, ownerId, { tier: 'reserve' });
      const userId = newUser();
      const now = new Date('2026-11-24T09:00:00.000Z');
      expect(await repo.joinByInvite({ invite: { ...invite }, userId, action: 'join', now })).toBe('ok');
      expect(await members(group.id, userId)).toMatchObject({
        tier: 'reserve',
        role: 'everyone',
        createdAt: now.toISOString(),
        inviteId: invite.id,
        invitedBy: ownerId,
      });
      const stored = await repo.getInvite(group.id, invite.id, { consistent: true });
      expect(stored?.uses).toBe(1);
      expect(stored?.version).toBe(2);
      const uses = await repo.listInviteUses(group.id);
      expect(uses.filter((u) => u.inviteId === invite.id).map((u) => u.userId)).toEqual([userId]);
      expect((await repo.listMine(userId)).map((m) => m.group.id)).toEqual([group.id]);
    });

    it('GRV-22: promote faz a reserva virar membro, mantém a data e troca o convite de origem', async () => {
      const { group, ownerId } = await setup();
      const userId = await addMember(repo, group.id, ownerId, 'reserve');
      const before = await members(group.id, userId);
      const second = await issue(group.id, ownerId, { tier: 'member' });
      const now = new Date('2026-11-25T09:00:00.000Z');
      expect(await repo.joinByInvite({ invite: { ...second }, userId, action: 'promote', now })).toBe('ok');
      const after = await members(group.id, userId);
      expect(after).toMatchObject({ tier: 'member', inviteId: second.id, invitedBy: ownerId });
      expect(after?.createdAt).toBe(before?.createdAt);
      expect(before?.inviteId).not.toBe(second.id);
      expect(await repo.listMine(userId)).toHaveLength(1);
    });

    it('GRV-22: join de quem já participa → membership_stale, sem gastar uso', async () => {
      const { group, ownerId } = await setup();
      const userId = await addMember(repo, group.id, ownerId, 'member');
      const invite = await issue(group.id, ownerId);
      expect(await repo.joinByInvite({ invite: { ...invite }, userId, action: 'join', now: T0 })).toBe(
        'membership_stale',
      );
      expect((await repo.getInvite(group.id, invite.id, { consistent: true }))?.uses).toBe(0);
    });

    it('GRV-22: promote de quem é membro ou não participa → membership_stale, sem gastar uso', async () => {
      const { group, ownerId } = await setup();
      const member = await addMember(repo, group.id, ownerId, 'member');
      const stranger = newUser();
      const invite = await issue(group.id, ownerId);
      expect(
        await repo.joinByInvite({ invite: { ...invite }, userId: member, action: 'promote', now: T0 }),
      ).toBe('membership_stale');
      expect(
        await repo.joinByInvite({ invite: { ...invite }, userId: stranger, action: 'promote', now: T0 }),
      ).toBe('membership_stale');
      expect(await members(group.id, stranger)).toBeUndefined();
      expect((await repo.getInvite(group.id, invite.id, { consistent: true }))?.uses).toBe(0);
    });

    it('GRV-22: o pedido esperando some quando a pessoa entra por convite', async () => {
      const { group, ownerId } = await setup();
      const userId = newUser();
      expect(await repo.putRequest({ groupId: group.id, userId, createdAt: T0.toISOString() })).toBe(true);
      const invite = await issue(group.id, ownerId);
      expect(await repo.joinByInvite({ invite: { ...invite }, userId, action: 'join', now: T0 })).toBe('ok');
      expect(await repo.getRequest(group.id, userId, { consistent: true })).toBeUndefined();
    });

    it('GRV-20: convite cancelado → invite_stale, sem participação', async () => {
      const { group, ownerId } = await setup();
      const invite = await issue(group.id, ownerId);
      await repo.revokeInvite(invite, T0);
      const userId = newUser();
      expect(await repo.joinByInvite({ invite: { ...invite }, userId, action: 'join', now: T0 })).toBe(
        'invite_stale',
      );
      expect(await members(group.id, userId)).toBeUndefined();
    });

    it('GRV-24: convite recusado → invite_stale', async () => {
      const { group, ownerId } = await setup();
      const targetId = newUser();
      const invite = await issue(group.id, ownerId, { target: { userId: targetId }, maxUses: 1 });
      await repo.declineInvite(invite, T0);
      expect(
        await repo.joinByInvite({ invite: { ...invite }, userId: targetId, action: 'join', now: T0 }),
      ).toBe('invite_stale');
      expect(await members(group.id, targetId)).toBeUndefined();
    });

    it('GRV-19: convite vencido (expiresAt <= now) → invite_stale', async () => {
      const { group, ownerId } = await setup();
      const invite = await issue(group.id, ownerId, { expiresAt: T0.toISOString() });
      const userId = newUser();
      expect(await repo.joinByInvite({ invite: { ...invite }, userId, action: 'join', now: T0 })).toBe(
        'invite_stale',
      );
      expect(await members(group.id, userId)).toBeUndefined();
    });

    it('GRV-18: o último uso entra e dá ttl ao convite; depois disso → invite_stale', async () => {
      const { group, ownerId } = await setup();
      const invite = await issue(group.id, ownerId, { maxUses: 1 });
      expect(
        await repo.joinByInvite({ invite: { ...invite }, userId: newUser(), action: 'join', now: T0 }),
      ).toBe('ok');
      const reread = await repo.getInvite(group.id, invite.id, { consistent: true });
      expect(reread?.uses).toBe(1);
      expect(reread?.ttl).toBe(ttlOf(T0));
      const second = newUser();
      expect(
        await repo.joinByInvite({
          invite: { ...(reread as StoredInvite) },
          userId: second,
          action: 'join',
          now: T0,
        }),
      ).toBe('invite_stale');
      expect(await members(group.id, second)).toBeUndefined();
    });

    it('GRV-22: leitura atrasada de uses (limite 3, lido com 0, já em 1) → invite_stale, e nada muda', async () => {
      const { group, ownerId } = await setup();
      const invite = await issue(group.id, ownerId, { maxUses: 3 });
      const stale = { ...invite };
      expect(
        await repo.joinByInvite({ invite: { ...invite }, userId: newUser(), action: 'join', now: T0 }),
      ).toBe('ok');
      const late = newUser();
      expect(await repo.joinByInvite({ invite: stale, userId: late, action: 'join', now: T0 })).toBe(
        'invite_stale',
      );
      expect(await members(group.id, late)).toBeUndefined();
      expect((await repo.getInvite(group.id, invite.id, { consistent: true }))?.uses).toBe(1);
    });

    it.each([
      { name: 'pelo id', target: (userId: UserId) => ({ userId }) },
      { name: 'pelo email', target: () => ({ email: `${randomUUID()}@example.com` }) },
    ])('GRV-23: convite pessoal $name com 1 uso: entra, esgota e ganha ttl', async ({ target }) => {
      const { group, ownerId } = await setup();
      const targetUser = newUser();
      const invite = await issue(group.id, ownerId, { target: target(targetUser), maxUses: 1 });
      expect(
        await repo.joinByInvite({ invite: { ...invite }, userId: targetUser, action: 'join', now: T0 }),
      ).toBe('ok');
      expect((await repo.getInvite(group.id, invite.id, { consistent: true }))?.ttl).toBe(ttlOf(T0));
      expect(await members(group.id, targetUser)).toMatchObject({ inviteId: invite.id });
    });

    it('GRV-18: convite com prazo e sem limite não ganha ttl ao entrar', async () => {
      const { group, ownerId } = await setup();
      const invite = await issue(group.id, ownerId, { expiresAt: '2026-12-31T00:00:00.000Z' });
      expect(
        await repo.joinByInvite({ invite: { ...invite }, userId: newUser(), action: 'join', now: T0 }),
      ).toBe('ok');
      expect((await repo.getInvite(group.id, invite.id, { consistent: true }))?.ttl).toBeUndefined();
    });
  });

  describe('approveRequest', () => {
    const setup = async () => {
      const group = newGroup();
      const ownerId = newUser();
      await repo.create(group, ownerId);
      return { group, ownerId };
    };

    it.each(['member', 'reserve'] as const)(
      'GRV-28: aceitar com pedido grava a participação como %s, sem convite, e apaga o pedido',
      async (tier) => {
        const { group } = await setup();
        const userId = newUser();
        await repo.putRequest({ groupId: group.id, userId, createdAt: T0.toISOString() });
        const now = new Date('2026-11-24T12:00:00.000Z');
        expect(await repo.approveRequest({ groupId: group.id, userId, tier, now })).toBe('ok');
        const m = await repo.getMembership(group.id, userId, { consistent: true });
        expect(m).toMatchObject({ tier, role: 'everyone' });
        expect(m?.inviteId).toBeUndefined();
        expect(await repo.getRequest(group.id, userId, { consistent: true })).toBeUndefined();
        expect((await repo.listMine(userId)).map((x) => x.group.id)).toEqual([group.id]);
      },
    );

    it('GRV-28: sem pedido → request_gone, sem participação', async () => {
      const { group } = await setup();
      const userId = newUser();
      expect(await repo.approveRequest({ groupId: group.id, userId, tier: 'member', now: T0 })).toBe(
        'request_gone',
      );
      expect(await repo.getMembership(group.id, userId, { consistent: true })).toBeUndefined();
    });

    it('GRV-28: quem já participa → already_member, o pedido some e a participação não muda', async () => {
      const { group, ownerId } = await setup();
      const userId = await addMember(repo, group.id, ownerId, 'member');
      const before = await repo.getMembership(group.id, userId, { consistent: true });
      expect(await repo.putRequest({ groupId: group.id, userId, createdAt: T0.toISOString() })).toBe(true);
      expect(await repo.approveRequest({ groupId: group.id, userId, tier: 'reserve', now: T0 })).toBe(
        'already_member',
      );
      expect(await repo.getRequest(group.id, userId, { consistent: true })).toBeUndefined();
      expect(await repo.getMembership(group.id, userId, { consistent: true })).toEqual(before);
    });
  });

  describe('etapa 3: leituras, convites, cargos, participações, modo e pedidos', () => {
    const DAY = 24 * 60 * 60;
    const ttlOf = (now: Date) => Math.floor(now.getTime() / 1000) + 30 * DAY;
    const setup = async () => {
      const group = newGroup();
      const ownerId = newUser();
      await repo.create(group, ownerId);
      return { group, ownerId };
    };
    const issue = async (groupId: GroupId, ownerId: UserId, overrides: Partial<StoredInvite> = {}) => {
      const invite = newInvite(groupId, ownerId, overrides);
      await repo.createInvite(invite);
      return invite;
    };
    const stored = (groupId: GroupId, inviteId: string) =>
      repo.getInvite(groupId, inviteId, { consistent: true });
    const conflictOf = (p: Promise<unknown>) =>
      p.then(
        () => undefined,
        (e: unknown) => e as { code?: string; details?: unknown },
      );

    it('GRV-08: grupo, participação e código que não existem → undefined', async () => {
      const id = asGroupId(randomUUID());
      expect(await repo.get(id, { consistent: true })).toBeUndefined();
      expect(await repo.getMembership(id, newUser(), { consistent: true })).toBeUndefined();
      expect(await repo.resolve(pid(randomUUID().slice(0, 8).toUpperCase()))).toBeUndefined();
    });

    it('GRV-18: createInvite grava o convite, o token leva a ele e só o grupo dele o lista', async () => {
      const { group, ownerId } = await setup();
      const other = await setup();
      const invite = await issue(group.id, ownerId);
      expect(await stored(group.id, invite.id)).toEqual(invite);
      expect((await stored(group.id, invite.id))?.version).toBe(1);
      expect(await repo.resolveToken(invite.token)).toEqual({ groupId: group.id, inviteId: invite.id });
      expect((await repo.listInvites(group.id)).map((i) => i.id)).toEqual([invite.id]);
      expect(await repo.listInvites(other.group.id)).toEqual([]);
    });

    it('GRV-18: createInvite com o token de outro convite → erro, e o segundo não existe', async () => {
      const { group, ownerId } = await setup();
      const first = await issue(group.id, ownerId);
      const second = newInvite(group.id, ownerId, { token: first.token });
      await expect(repo.createInvite(second)).rejects.toBeDefined();
      expect(await stored(group.id, second.id)).toBeUndefined();
      expect(await repo.resolveToken(first.token)).toEqual({ groupId: group.id, inviteId: first.id });
    });

    it('GRV-23/24: convite pessoal pelo id e pelo email: cada alvo acha o seu, e resolveInviteId leva a ele', async () => {
      const { group, ownerId } = await setup();
      const targetId = newUser();
      const email = `${randomUUID()}@example.com`;
      const byId = await issue(group.id, ownerId, { target: { userId: targetId }, maxUses: 1 });
      const byEmail = await issue(group.id, ownerId, { target: { email }, maxUses: 1 });
      const common = await issue(group.id, ownerId);
      expect(await repo.listInvitesFor({ userId: targetId })).toEqual([
        { groupId: group.id, inviteId: byId.id },
      ]);
      expect(await repo.listInvitesFor({ email })).toEqual([{ groupId: group.id, inviteId: byEmail.id }]);
      expect(await repo.resolveInviteId(byId.id)).toEqual({ groupId: group.id, inviteId: byId.id });
      expect(await repo.resolveInviteId(byEmail.id)).toEqual({ groupId: group.id, inviteId: byEmail.id });
      expect(await repo.resolveInviteId(common.id)).toBeUndefined();
    });

    it('GRV-20: revokeInvite grava revokedAt, ttl e soma 1 na version; cancelar de novo não muda nada', async () => {
      const { group, ownerId } = await setup();
      const invite = await issue(group.id, ownerId);
      const at = new Date('2026-11-24T09:00:00.000Z');
      await repo.revokeInvite({ ...invite }, at);
      const first = await stored(group.id, invite.id);
      expect(first?.revokedAt).toBe(at.toISOString());
      expect(first?.ttl).toBe(ttlOf(at));
      expect(first?.version).toBe(2);
      await repo.revokeInvite({ ...invite }, new Date('2026-11-25T09:00:00.000Z'));
      const second = await stored(group.id, invite.id);
      expect(second?.revokedAt).toBe(first?.revokedAt);
      expect(second?.version).toBe(2);
    });

    it('GRV-20: revokeInvite de convite pessoal não falha, e ele continua achável por listInvitesFor', async () => {
      const { group, ownerId } = await setup();
      const targetId = newUser();
      const invite = await issue(group.id, ownerId, { target: { userId: targetId }, maxUses: 1 });
      await repo.revokeInvite({ ...invite }, T0);
      expect((await stored(group.id, invite.id))?.revokedAt).toBe(T0.toISOString());
      expect(await repo.listInvitesFor({ userId: targetId })).toEqual([
        { groupId: group.id, inviteId: invite.id },
      ]);
    });

    it('GRV-24: declineInvite grava declinedAt, ttl e soma 1 na version; recusar de novo não muda nada', async () => {
      const { group, ownerId } = await setup();
      const invite = await issue(group.id, ownerId, { target: { userId: newUser() }, maxUses: 1 });
      const at = new Date('2026-11-24T09:00:00.000Z');
      await repo.declineInvite({ ...invite }, at);
      const first = await stored(group.id, invite.id);
      expect(first?.declinedAt).toBe(at.toISOString());
      expect(first?.ttl).toBe(ttlOf(at));
      expect(first?.version).toBe(2);
      await repo.declineInvite({ ...invite }, new Date('2026-11-25T09:00:00.000Z'));
      const second = await stored(group.id, invite.id);
      expect(second?.declinedAt).toBe(first?.declinedAt);
      expect(second?.version).toBe(2);
    });

    it('GRV-24: declineInvite de convite cancelado não muda nada', async () => {
      const { group, ownerId } = await setup();
      const invite = await issue(group.id, ownerId, { target: { userId: newUser() }, maxUses: 1 });
      await repo.revokeInvite({ ...invite }, T0);
      const before = await stored(group.id, invite.id);
      await repo.declineInvite({ ...invite }, new Date('2026-11-25T09:00:00.000Z'));
      const after = await stored(group.id, invite.id);
      expect(after?.declinedAt).toBeUndefined();
      expect(after).toEqual(before);
    });

    it('GRV-19: listInviteUses traz os usos do grupo e não os de outro', async () => {
      const { group, ownerId } = await setup();
      const other = await setup();
      const a = await addMember(repo, group.id, ownerId, 'member');
      const b = await addMember(repo, group.id, ownerId, 'reserve');
      await addMember(repo, other.group.id, other.ownerId, 'member');
      const uses = await repo.listInviteUses(group.id);
      expect(uses.map((u) => u.userId).sort()).toEqual([a, b].sort());
      expect(uses.every((u) => u.groupId === group.id)).toBe(true);
    });

    it('GRV-44: saveRoles com a version atual grava os cargos e as permissões do Todos', async () => {
      const { group } = await setup();
      const roles = [{ id: randomUUID(), name: 'Mesário', permissions: ['members.invite' as const] }];
      await repo.saveRoles(group.id, { roles, everyonePermissions: ['group.edit'] }, 1, T0);
      expect(await repo.getRoles(group.id, { consistent: true })).toMatchObject({
        roles,
        everyonePermissions: ['group.edit'],
        version: 2,
      });
    });

    it('GRV-44: saveRoles com version velha → VERSION_CONFLICT com a version atual, e nada muda', async () => {
      const { group } = await setup();
      await repo.saveRoles(group.id, { roles: [], everyonePermissions: ['group.edit'] }, 1, T0);
      const err = await conflictOf(
        repo.saveRoles(group.id, { roles: [], everyonePermissions: ['roles.manage'] }, 1, T0),
      );
      expect(err?.code).toBe('VERSION_CONFLICT');
      expect(err?.details).toEqual({ currentVersion: 2 });
      expect(await repo.getRoles(group.id, { consistent: true })).toMatchObject({
        everyonePermissions: ['group.edit'],
        version: 2,
      });
    });

    it('GRV-48: setMemberRole troca o cargo de quem participa; de quem não participa → false', async () => {
      const { group, userId } = await groupWith(repo, 'member');
      expect(await repo.setMemberRole(group.id, userId, 'r9')).toBe(true);
      expect((await repo.getMembership(group.id, userId, { consistent: true }))?.role).toBe('r9');
      const stranger = newUser();
      expect(await repo.setMemberRole(group.id, stranger, 'r9')).toBe(false);
      expect(await repo.getMembership(group.id, stranger, { consistent: true })).toBeUndefined();
    });

    it('GRV-29/21: listMembers traz as participações do grupo e countParticipants dá o mesmo número', async () => {
      const { group, ownerId } = await setup();
      const other = await setup();
      const member = await addMember(repo, group.id, ownerId, 'member');
      const reserve = await addMember(repo, group.id, ownerId, 'reserve');
      await addMember(repo, other.group.id, other.ownerId, 'member');
      const list = await repo.listMembers(group.id);
      expect(list.map((m) => m.userId).sort()).toEqual([ownerId, member, reserve].sort());
      expect(await repo.countParticipants(group.id)).toBe(3);
    });

    it('GRV-30/31: removeMembership apaga a participação, baixa a contagem e tira o grupo de listMine; de novo → false', async () => {
      const { group, ownerId } = await setup();
      const userId = await addMember(repo, group.id, ownerId, 'member');
      expect(await repo.countParticipants(group.id)).toBe(2);
      expect(await repo.removeMembership(group.id, userId)).toBe(true);
      expect(await repo.getMembership(group.id, userId, { consistent: true })).toBeUndefined();
      expect(await repo.countParticipants(group.id)).toBe(1);
      expect(await repo.listMine(userId)).toEqual([]);
      expect(await repo.removeMembership(group.id, userId)).toBe(false);
    });

    it('GRV-25: setJoinMode com a version atual troca o modo e soma 1 na version do grupo', async () => {
      const { group } = await setup();
      await repo.setJoinMode(group.id, 'open', 1, T0);
      expect(await repo.get(group.id, { consistent: true })).toMatchObject({ joinMode: 'open', version: 2 });
    });

    it('GRV-25: setJoinMode com version velha → VERSION_CONFLICT com a version atual, e o modo não muda', async () => {
      const { group } = await setup();
      await repo.setJoinMode(group.id, 'open', 1, T0);
      const err = await conflictOf(repo.setJoinMode(group.id, 'invite', 1, T0));
      expect(err?.code).toBe('VERSION_CONFLICT');
      expect(err?.details).toEqual({ currentVersion: 2 });
      expect(await repo.get(group.id, { consistent: true })).toMatchObject({ joinMode: 'open', version: 2 });
    });

    it('GRV-27: putRequest grava o pedido; o segundo da mesma pessoa → false e fica o primeiro', async () => {
      const { group } = await setup();
      const userId = newUser();
      const first = { groupId: group.id, userId, createdAt: T0.toISOString() };
      expect(await repo.putRequest(first)).toBe(true);
      expect(await repo.getRequest(group.id, userId, { consistent: true })).toMatchObject(first);
      expect(await repo.putRequest({ ...first, createdAt: '2026-11-25T00:00:00.000Z' })).toBe(false);
      expect((await repo.getRequest(group.id, userId, { consistent: true }))?.createdAt).toBe(
        first.createdAt,
      );
    });

    it('GRV-28: listRequests traz os pedidos do grupo e não os de outro', async () => {
      const { group } = await setup();
      const other = await setup();
      const a = newUser();
      const b = newUser();
      await repo.putRequest({ groupId: group.id, userId: a, createdAt: T0.toISOString() });
      await repo.putRequest({ groupId: group.id, userId: b, createdAt: T0.toISOString() });
      await repo.putRequest({ groupId: other.group.id, userId: newUser(), createdAt: T0.toISOString() });
      expect((await repo.listRequests(group.id)).map((r) => r.userId).sort()).toEqual([a, b].sort());
    });

    it('GRV-27: deleteRequest apaga o pedido; sem pedido, com mustExist → false e sem mustExist → true', async () => {
      const { group } = await setup();
      const userId = newUser();
      await repo.putRequest({ groupId: group.id, userId, createdAt: T0.toISOString() });
      expect(await repo.deleteRequest(group.id, userId, { mustExist: true })).toBe(true);
      expect(await repo.getRequest(group.id, userId, { consistent: true })).toBeUndefined();
      expect(await repo.deleteRequest(group.id, userId, { mustExist: true })).toBe(false);
      expect(await repo.deleteRequest(group.id, userId)).toBe(true);
    });
  });
});
