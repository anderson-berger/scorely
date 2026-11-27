import { asGroupId, asUserId, type GroupId, type UserId } from '@scorely/api/src/lib/ids';
import { memoryGroups } from '@scorely/api/src/modules/groups/data/groups.memory';
import type { StoredGroup } from '@scorely/api/src/modules/groups/data/groups.repository';
import { createGroupAccess } from '@scorely/api/src/modules/groups/groups.access';
import { ANA, BIA, CAIO, codeOf, DUDA, pid } from '@scorely/api/src/modules/groups/tests/fixtures';
import { GroupPermissionSchema } from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

// O que o módulo de partidas pergunta ao grupo: quem participa, como e com quais permissões (GRV-04, 15, 17, 41).

const T0 = '2026-11-23T10:00:00.000Z';
const HELPER = '55555555-5555-4555-8555-555555555555';
const PUBLIC = pid('K3X9PQ2A');

async function setup() {
  const mem = memoryGroups();
  const group: StoredGroup = {
    id: asGroupId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    publicId: PUBLIC,
    name: 'Pelada de sexta',
    joinMode: 'invite',
    modality: 'mixed',
    createdAt: T0,
    updatedAt: T0,
    version: 1,
  };
  await mem.repo.create(group, ANA);
  const join = (userId: UserId, tier: 'member' | 'reserve', role = 'everyone') =>
    mem.members.set(`${group.id}#${userId}`, { groupId: group.id, userId, tier, role, createdAt: T0 });
  join(BIA, 'member');
  join(CAIO, 'member', HELPER);
  join(DUDA, 'reserve');
  mem.rolesByGroup.set(group.id, {
    roles: [{ id: HELPER, name: 'Organizador', permissions: ['matches.manage'] }],
    everyonePermissions: [],
    createdAt: T0,
    updatedAt: T0,
    version: 1,
  });
  return { mem, group, access: createGroupAccess(mem.repo) };
}

describe('GroupAccess', () => {
  it('GRV-15: o Dono tem todas as permissões, inclusive matches.manage', async () => {
    const { access, group } = await setup();
    const result = await access.access(ANA, PUBLIC);
    expect(result.groupId).toBe(group.id);
    expect(result.publicId).toBe(PUBLIC);
    expect(result.name).toBe('Pelada de sexta');
    expect(result.tier).toBe('member');
    expect([...result.permissions].sort()).toEqual([...GroupPermissionSchema.options].sort());
  });

  it('GRV-41: matches.manage nasce desmarcada: o membro do Todos não a tem', async () => {
    const { access } = await setup();
    expect((await access.access(BIA, PUBLIC)).permissions).not.toContain('matches.manage');
  });

  it('GRV-15, GRV-41: um cargo com matches.manage dá a permissão; as do Todos somam', async () => {
    const { access, mem, group } = await setup();
    expect((await access.access(CAIO, PUBLIC)).permissions).toContain('matches.manage');
    mem.rolesByGroup.set(group.id, {
      roles: [],
      everyonePermissions: ['matches.manage'],
      createdAt: T0,
      updatedAt: T0,
      version: 2,
    });
    expect((await access.access(BIA, PUBLIC)).permissions).toContain('matches.manage');
  });

  it('GRV-17: a reserva participa como reserva', async () => {
    const { access } = await setup();
    expect((await access.access(DUDA, PUBLIC)).tier).toBe('reserve');
  });

  it('GRV-04: quem não participa recebe GROUP_NOT_FOUND', async () => {
    const { access } = await setup();
    const stranger = asUserId('99999999-9999-4999-8999-999999999999');
    expect(await codeOf(access.access(stranger, PUBLIC))).toBe('GROUP_NOT_FOUND');
  });

  it('GRV-04: um código que não existe também recebe GROUP_NOT_FOUND', async () => {
    const { access } = await setup();
    expect(await codeOf(access.access(ANA, pid('ZZZZZZZZ')))).toBe('GROUP_NOT_FOUND');
  });

  it('PAR-10: participants devolve quem participa hoje, com a participação', async () => {
    const { access, group } = await setup();
    const people = await access.participants(group.id);
    expect(people.get(ANA)).toMatchObject({ tier: 'member', joinedAt: T0 });
    expect(people.get(BIA)).toMatchObject({ tier: 'member', joinedAt: T0 });
    expect(people.get(DUDA)).toMatchObject({ tier: 'reserve', joinedAt: T0 });
    expect(people.size).toBe(4);
  });

  it('PAR-10: quem saiu do grupo some de participants', async () => {
    const { access, group, mem } = await setup();
    await mem.repo.removeMembership(group.id, BIA);
    const people = await access.participants(group.id);
    expect(people.has(BIA)).toBe(false);
    expect(people.size).toBe(3);
  });

  it('PAR-12: holders devolve quem tem a permissão (o Dono e o cargo), não os outros', async () => {
    const { access, group } = await setup();
    const holders = await access.holders(group.id, 'matches.manage');
    expect([...holders].sort()).toEqual([ANA, CAIO].sort());
  });

  it('PAR-12: um grupo sem ninguém com a permissão além do Dono devolve só o Dono', async () => {
    const { access, mem } = await setup();
    const other = asGroupId('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') as GroupId;
    await mem.repo.create(
      {
        id: other,
        publicId: pid('K3X9PQ2B'),
        name: 'Outro',
        joinMode: 'invite',
        modality: 'mixed',
        createdAt: T0,
        updatedAt: T0,
        version: 1,
      },
      BIA,
    );
    expect(await access.holders(other, 'matches.manage')).toEqual([BIA]);
  });
});
