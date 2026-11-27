import { memoryGroups } from '@scorely/api/src/modules/groups/data/groups.memory';
import type { GroupsDeps } from '@scorely/api/src/modules/groups/groups.service';
import { createGroup, getGroup, listMyGroups } from '@scorely/api/src/modules/groups/rules/groups';
import {
  ANA,
  BIA,
  errorOf,
  noEmails,
  noNotifications,
  pid,
} from '@scorely/api/src/modules/groups/tests/fixtures';
import { PublicGroupIdSchema } from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

const NOW = new Date('2026-11-20T10:00:00.000Z');

function setup(codes: string[] = []) {
  const mem = memoryGroups();
  const queue = { rest: [...codes] };
  const deps: GroupsDeps = {
    groups: mem.repo,
    emails: noEmails,
    notifications: noNotifications,
    users: { getMany: async () => [], resolve: async () => new Map() },
    now: () => NOW,
    newPublicId: () => {
      const [next, ...rest] = queue.rest;
      queue.rest = rest;
      return pid(next ?? 'ZZZZZZZZ');
    },
  };
  return { ...mem, deps };
}

describe('groups service', () => {
  it('GRV-01: criar devolve o grupo só com o nome, com version 1 e a data', async () => {
    const { deps } = setup(['K3X9PQ2A']);
    const group = await createGroup(deps, ANA, { name: 'Pelada de sexta' });
    expect(group).toMatchObject({
      id: 'K3X9PQ2A',
      name: 'Pelada de sexta',
      version: 1,
      createdAt: NOW.toISOString(),
    });
  });

  it('GRV-02: quem cria é o dono e a única participação do grupo', async () => {
    const { members, deps } = setup(['K3X9PQ2A']);
    const group = await createGroup(deps, ANA, { name: 'Pelada' });
    expect(group.myRole).toEqual({ id: 'owner' });
    expect([...members.values()]).toHaveLength(1);
    expect([...members.values()][0]).toMatchObject({ userId: ANA, role: 'owner', tier: 'member' });
    expect(group.myTier).toBe('member');
  });

  it('GRV-02: o grupo nasce no modo de convite', async () => {
    const { groups, deps } = setup(['K3X9PQ2A']);
    await createGroup(deps, ANA, { name: 'Pelada' });
    expect([...groups.values()][0]).toMatchObject({ joinMode: 'invite' });
  });

  it('GRV-04: o grupo vem com myTier e myPermissions de quem pede (GRV-16)', async () => {
    const { deps } = setup(['K3X9PQ2A']);
    await createGroup(deps, ANA, { name: 'Pelada' });
    expect(await getGroup(deps, ANA, pid('K3X9PQ2A'))).toMatchObject({
      myTier: 'member',
      myRole: { id: 'owner' },
      myPermissions: [
        'group.edit',
        'members.invite',
        'members.remove',
        'roles.manage',
        'matches.manage',
        'competitions.manage',
      ],
    });
  });

  it('GRV-05: meus grupos trazem myTier, myRole e myPermissions', async () => {
    const { deps } = setup(['AAAAAAAA']);
    await createGroup(deps, ANA, { name: 'Pelada' });
    expect((await listMyGroups(deps, ANA))[0]).toMatchObject({
      myTier: 'member',
      myRole: { id: 'owner' },
      myPermissions: [
        'group.edit',
        'members.invite',
        'members.remove',
        'roles.manage',
        'matches.manage',
        'competitions.manage',
      ],
    });
  });

  it('GRV-03: o nome pode repetir, também entre os grupos da mesma pessoa', async () => {
    const { deps } = setup(['AAAAAAAA', 'BBBBBBBB']);
    const a = await createGroup(deps, ANA, { name: 'Pelada' });
    const b = await createGroup(deps, ANA, { name: 'Pelada' });
    expect(a.id).not.toBe(b.id);
    expect(await listMyGroups(deps, ANA)).toHaveLength(2);
  });

  it('GRV-08: a resposta traz só o id público; o uuid fica no banco', async () => {
    const { groups, deps } = setup(['K3X9PQ2A']);
    const group = await createGroup(deps, ANA, { name: 'Pelada' });
    expect(PublicGroupIdSchema.safeParse(group.id).success).toBe(true);
    expect(group).not.toHaveProperty('publicId');
    const [stored] = [...groups.values()];
    expect(stored?.publicId).toBe('K3X9PQ2A');
    expect(stored?.id).not.toBe(group.id);
  });

  it('GRV-08: código público já usado → tenta de novo com outro código', async () => {
    const { calls, deps } = setup(['AAAAAAAA', 'AAAAAAAA', 'BBBBBBBB']);
    await createGroup(deps, ANA, { name: 'Um' });
    const second = await createGroup(deps, BIA, { name: 'Dois' });
    expect(second.id).toBe('BBBBBBBB');
    expect(calls.create).toBe(3);
  });

  it('GRV-08: três colisões seguidas viram erro comum (não é regra de negócio)', async () => {
    const { deps } = setup(['AAAAAAAA', 'AAAAAAAA', 'AAAAAAAA', 'AAAAAAAA']);
    await createGroup(deps, ANA, { name: 'Um' });
    const err = await errorOf(createGroup(deps, BIA, { name: 'Dois' }));
    expect(err).toBeInstanceOf(Error);
    expect(err?.code).toBeUndefined();
  });

  it('GRV-04: quem participa vê o grupo pelo código público, com o myRole', async () => {
    const { deps } = setup(['K3X9PQ2A']);
    await createGroup(deps, ANA, { name: 'Pelada' });
    expect(await getGroup(deps, ANA, pid('K3X9PQ2A'))).toMatchObject({
      id: 'K3X9PQ2A',
      name: 'Pelada',
      myRole: { id: 'owner' },
    });
  });

  it('GRV-04: quem não participa recebe GROUP_NOT_FOUND (404)', async () => {
    const { deps } = setup(['K3X9PQ2A']);
    await createGroup(deps, ANA, { name: 'Pelada' });
    const err = await errorOf(getGroup(deps, BIA, pid('K3X9PQ2A')));
    expect(err?.code).toBe('GROUP_NOT_FOUND');
    expect(err?.status).toBe(404);
  });

  it('GRV-04: código que não existe recebe o mesmo GROUP_NOT_FOUND (404)', async () => {
    const { deps } = setup();
    const err = await errorOf(getGroup(deps, ANA, pid('00000000')));
    expect(err?.code).toBe('GROUP_NOT_FOUND');
    expect(err?.status).toBe(404);
  });

  it('GRV-05: meus grupos em ordem de nome, sem diferenciar maiúsculas e acentos', async () => {
    const { deps } = setup(['AAAAAAAA', 'BBBBBBBB', 'CCCCCCCC', 'DDDDDDDD']);
    await createGroup(deps, ANA, { name: 'Basquete' });
    await createGroup(deps, ANA, { name: 'abc' });
    await createGroup(deps, ANA, { name: 'Éden' });
    await createGroup(deps, ANA, { name: 'dados' });
    expect((await listMyGroups(deps, ANA)).map((g) => g.name)).toEqual(['abc', 'Basquete', 'dados', 'Éden']);
  });

  it('GRV-05: só os grupos de quem pede, cada um com o myRole; sem grupo, lista vazia', async () => {
    const { deps } = setup(['AAAAAAAA']);
    await createGroup(deps, ANA, { name: 'Pelada' });
    expect(await listMyGroups(deps, BIA)).toEqual([]);
    expect((await listMyGroups(deps, ANA)).map((g) => g.myRole)).toEqual([{ id: 'owner' }]);
  });
});
