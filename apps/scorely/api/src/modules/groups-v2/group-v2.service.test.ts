import type { AppError } from '@scorely/api/src/lib/errors';
import { createGroupV2Service } from '@scorely/api/src/modules/groups-v2/group-v2.service';
import { ANA, BIA, memoryGroupsV2, pid } from '@scorely/api/src/modules/groups-v2/groups-v2.memory';
import { PublicGroupIdSchema } from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

const NOW = new Date('2026-11-20T10:00:00.000Z');

function setup(codes: string[] = []) {
  const mem = memoryGroupsV2();
  const queue = { rest: [...codes] };
  const service = createGroupV2Service({
    groups: mem.repo,
    users: { getMany: async () => [], resolve: async () => new Map() },
    now: () => NOW,
    newPublicId: () => {
      const [next, ...rest] = queue.rest;
      queue.rest = rest;
      return pid(next ?? 'ZZZZZZZZ');
    },
  });
  return { ...mem, service };
}

async function errorOf(p: Promise<unknown>) {
  return (await p.then(
    () => undefined,
    (e: unknown) => e,
  )) as AppError | undefined;
}

describe('groups-v2 service', () => {
  it('GRV-01: criar devolve o grupo só com o nome, com version 1 e a data', async () => {
    const { service } = setup(['K3X9PQ2A']);
    const group = await service.create(ANA, { name: 'Pelada de sexta' });
    expect(group).toMatchObject({
      id: 'K3X9PQ2A',
      name: 'Pelada de sexta',
      version: 1,
      createdAt: NOW.toISOString(),
    });
  });

  it('GRV-02: quem cria é o dono e a única participação do grupo', async () => {
    const { service, members } = setup(['K3X9PQ2A']);
    const group = await service.create(ANA, { name: 'Pelada' });
    expect(group.myRole).toBe('owner');
    expect([...members.values()]).toHaveLength(1);
    expect([...members.values()][0]).toMatchObject({ userId: ANA, role: 'owner', tier: 'member' });
    expect(group.myTier).toBe('member');
  });

  it('GRV-02: o grupo nasce no modo de convite', async () => {
    const { service, groups } = setup(['K3X9PQ2A']);
    await service.create(ANA, { name: 'Pelada' });
    expect([...groups.values()][0]).toMatchObject({ joinMode: 'invite' });
  });

  it('GRV-04: o grupo vem com myTier e myPermissions de quem pede (GRV-16)', async () => {
    const { service } = setup(['K3X9PQ2A']);
    await service.create(ANA, { name: 'Pelada' });
    expect(await service.get(ANA, pid('K3X9PQ2A'))).toMatchObject({
      myTier: 'member',
      myRole: 'owner',
      myPermissions: ['group.edit', 'members.invite', 'members.remove'],
    });
  });

  it('GRV-05: meus grupos trazem myTier, myRole e myPermissions', async () => {
    const { service } = setup(['AAAAAAAA']);
    await service.create(ANA, { name: 'Pelada' });
    expect((await service.mine(ANA))[0]).toMatchObject({
      myTier: 'member',
      myRole: 'owner',
      myPermissions: ['group.edit', 'members.invite', 'members.remove'],
    });
  });

  it('GRV-03: o nome pode repetir, também entre os grupos da mesma pessoa', async () => {
    const { service } = setup(['AAAAAAAA', 'BBBBBBBB']);
    const a = await service.create(ANA, { name: 'Pelada' });
    const b = await service.create(ANA, { name: 'Pelada' });
    expect(a.id).not.toBe(b.id);
    expect(await service.mine(ANA)).toHaveLength(2);
  });

  it('GRV-08: a resposta traz só o id público; o uuid fica no banco', async () => {
    const { service, groups } = setup(['K3X9PQ2A']);
    const group = await service.create(ANA, { name: 'Pelada' });
    expect(PublicGroupIdSchema.safeParse(group.id).success).toBe(true);
    expect(group).not.toHaveProperty('publicId');
    const [stored] = [...groups.values()];
    expect(stored?.publicId).toBe('K3X9PQ2A');
    expect(stored?.id).not.toBe(group.id);
  });

  it('GRV-08: código público já usado → tenta de novo com outro código', async () => {
    const { service, calls } = setup(['AAAAAAAA', 'AAAAAAAA', 'BBBBBBBB']);
    await service.create(ANA, { name: 'Um' });
    const second = await service.create(BIA, { name: 'Dois' });
    expect(second.id).toBe('BBBBBBBB');
    expect(calls.create).toBe(3);
  });

  it('GRV-08: três colisões seguidas viram erro comum (não é regra de negócio)', async () => {
    const { service } = setup(['AAAAAAAA', 'AAAAAAAA', 'AAAAAAAA', 'AAAAAAAA']);
    await service.create(ANA, { name: 'Um' });
    const err = await errorOf(service.create(BIA, { name: 'Dois' }));
    expect(err).toBeInstanceOf(Error);
    expect(err?.code).toBeUndefined();
  });

  it('GRV-04: quem participa vê o grupo pelo código público, com o myRole', async () => {
    const { service } = setup(['K3X9PQ2A']);
    await service.create(ANA, { name: 'Pelada' });
    expect(await service.get(ANA, pid('K3X9PQ2A'))).toMatchObject({
      id: 'K3X9PQ2A',
      name: 'Pelada',
      myRole: 'owner',
    });
  });

  it('GRV-04: quem não participa recebe GROUP_NOT_FOUND (404)', async () => {
    const { service } = setup(['K3X9PQ2A']);
    await service.create(ANA, { name: 'Pelada' });
    const err = await errorOf(service.get(BIA, pid('K3X9PQ2A')));
    expect(err?.code).toBe('GROUP_NOT_FOUND');
    expect(err?.status).toBe(404);
  });

  it('GRV-04: código que não existe recebe o mesmo GROUP_NOT_FOUND (404)', async () => {
    const { service } = setup();
    const err = await errorOf(service.get(ANA, pid('00000000')));
    expect(err?.code).toBe('GROUP_NOT_FOUND');
    expect(err?.status).toBe(404);
  });

  it('GRV-05: meus grupos em ordem de nome, sem diferenciar maiúsculas e acentos', async () => {
    const { service } = setup(['AAAAAAAA', 'BBBBBBBB', 'CCCCCCCC', 'DDDDDDDD']);
    await service.create(ANA, { name: 'Basquete' });
    await service.create(ANA, { name: 'abc' });
    await service.create(ANA, { name: 'Éden' });
    await service.create(ANA, { name: 'dados' });
    expect((await service.mine(ANA)).map((g) => g.name)).toEqual(['abc', 'Basquete', 'dados', 'Éden']);
  });

  it('GRV-05: só os grupos de quem pede, cada um com o myRole; sem grupo, lista vazia', async () => {
    const { service } = setup(['AAAAAAAA']);
    await service.create(ANA, { name: 'Pelada' });
    expect(await service.mine(BIA)).toEqual([]);
    expect((await service.mine(ANA)).map((g) => g.myRole)).toEqual(['owner']);
  });
});
