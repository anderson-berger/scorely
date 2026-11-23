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

/** Entra no grupo pelo próprio repositório (convite + entrar), para ter mais participações. */
async function addMember(
  repo: GroupRepository,
  groupId: GroupId,
  ownerId: UserId,
  tier: 'member' | 'reserve',
) {
  const userId = newUser();
  const invite: StoredInvite = {
    id: randomUUID(),
    groupId,
    token: randomUUID(),
    createdBy: ownerId,
    tier,
    uses: 0,
    createdAt: T0.toISOString(),
    updatedAt: T0.toISOString(),
    version: 1,
  };
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
});
