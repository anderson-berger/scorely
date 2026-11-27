import type { GroupsDeps } from '@scorely/api/src/modules/groups/groups.service';
import { ANA, BIA, errorOf, setupGroups } from '@scorely/api/src/modules/groups/tests/fixtures';
import { describe, expect, it } from 'vitest';

// Modalidade do grupo (GRV-52). As telas (GRV-14, 53, COM-13) ficam no roteiro manual.

const T0 = new Date('2026-11-25T10:00:00.000Z');

function setup() {
  return setupGroups({
    now: T0,
    users: {
      getMany: async (ids: readonly string[]) =>
        ids.map((id) => ({
          id,
          publicId: id === ANA ? '1AAAAAAA' : '2BBBBBBB',
          nickname: id === ANA ? 'ana' : 'bia',
          createdAt: '2026-01-01T00:00:00.000Z',
          version: 1,
        })),
      resolve: async () => new Map(),
    } as unknown as GroupsDeps['users'],
    newToken: () => 'token-1',
  });
}

async function withGroup() {
  const ctx = setup();
  const group = await ctx.service.create(ANA, { name: 'Pelada' });
  return { ...ctx, gid: group.id, version: group.version };
}

describe('groups modalidade', () => {
  it('GRV-02: o grupo nasce misto e a resposta traz a modality', async () => {
    const { service, gid } = await withGroup();
    expect(await service.get(ANA, gid)).toMatchObject({ modality: 'mixed' });
  });

  it('GRV-52: quem tem group.edit muda a modalidade, com a version conferida (sobe a version)', async () => {
    const { service, gid, version } = await withGroup();
    await service.setModality(ANA, gid, { modality: 'male', expectedVersion: version });
    const after = await service.get(ANA, gid);
    expect(after.modality).toBe('male');
    expect(after.version).toBeGreaterThan(version);
  });

  it('GRV-52: version velha → VERSION_CONFLICT (409) e a modalidade não muda', async () => {
    const { service, gid, version } = await withGroup();
    const err = await errorOf(
      service.setModality(ANA, gid, { modality: 'female', expectedVersion: version + 5 }),
    );
    expect(err?.code).toBe('VERSION_CONFLICT');
    expect(err?.status).toBe(409);
    expect((await service.get(ANA, gid)).modality).toBe('mixed');
  });

  it('GRV-52: quem não tem group.edit → GROUP_PERMISSION_DENIED (403)', async () => {
    const { service, gid, version } = await withGroup();
    const invite = await service.createInvite(ANA, gid, { tier: 'member', validityDays: 7, maxUses: null });
    await service.joinByInvite(BIA, invite.token);
    const err = await errorOf(service.setModality(BIA, gid, { modality: 'male', expectedVersion: version }));
    expect(err?.code).toBe('GROUP_PERMISSION_DENIED');
    expect(err?.status).toBe(403);
    expect((await service.get(ANA, gid)).modality).toBe('mixed');
  });

  it('GRV-52: a modalidade só informa, não barra ninguém de entrar num grupo masculino', async () => {
    const { service, gid, version } = await withGroup();
    await service.setModality(ANA, gid, { modality: 'male', expectedVersion: version });
    const invite = await service.createInvite(ANA, gid, { tier: 'member', validityDays: 7, maxUses: null });
    await service.joinByInvite(BIA, invite.token);
    expect(await service.get(BIA, gid)).toMatchObject({ modality: 'male' });
  });
});
