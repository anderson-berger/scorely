import type { UserId } from '@scorely/api/src/lib/ids';
import { asPublicUserId, asUserId } from '@scorely/api/src/lib/ids';
import type { GroupRepository } from '@scorely/api/src/modules/groups/data/groups.repository';
import { createGroup, getGroup } from '@scorely/api/src/modules/groups/rules/groups';
import { createInvite, joinByInvite } from '@scorely/api/src/modules/groups/rules/invites';
import { leave as leaveGroup, members } from '@scorely/api/src/modules/groups/rules/members';
import { createRole, listRoles, setMemberRole, transfer } from '@scorely/api/src/modules/groups/rules/roles';
import {
  ANA,
  BIA,
  CAIO,
  DUDA,
  errorOf,
  PUBLIC,
  setupGroups,
} from '@scorely/api/src/modules/groups/tests/fixtures';
import type { GroupPermission } from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

// Passar o grupo (GRV-49), sair depois (GRV-30) e o aviso (NTF-02). As telas (GRV-32) ficam em roles.test.ts do web.
//
// Interface assumida (não existe ainda):
//   transfer(deps, actor, gid, { userPublicId }): Promise<void>
//   repo.transferGroup({ groupId, fromUserId, toUserId, toRole, now }): Promise<'ok' | 'conflict'>

const T0 = new Date('2026-11-22T10:00:00.000Z');
const UNKNOWN = asPublicUserId('9XXXXXXX');
const MEMBER_INVITE = { tier: 'member', validityDays: 7, maxUses: null } as const;
const RESERVE_INVITE = { tier: 'reserve', validityDays: 7, maxUses: null } as const;

function pub(id: UserId) {
  return PUBLIC[id] ?? asPublicUserId('0ZZZZZZZ');
}

type Transfer = NonNullable<GroupRepository extends { transferGroup: infer F } ? F : never>;

/** `wrap` troca o `transferGroup` do repositório (para simular a corrida). */
function setup(wrap?: (repo: GroupRepository) => GroupRepository) {
  return setupGroups({ now: T0, wrap });
}

/**
 * Ana (Dono), Bia (Admin: invite, remove, roles.manage), Caio (Todos), Duda (reserva).
 * Os avisos já vêm zerados.
 */
async function withTeam(wrap?: (repo: GroupRepository) => GroupRepository) {
  const ctx = setup(wrap);
  const { deps } = ctx;
  const gid = (await createGroup(deps, ANA, { name: 'Pelada' })).id;
  const join = async (user: UserId, invite: typeof MEMBER_INVITE | typeof RESERVE_INVITE) => {
    const created = await createInvite(deps, ANA, gid, invite);
    await joinByInvite(deps, user, created.token);
  };
  await join(BIA, MEMBER_INVITE);
  await join(CAIO, MEMBER_INVITE);
  await join(DUDA, RESERVE_INVITE);
  const permissions: GroupPermission[] = ['members.invite', 'members.remove', 'roles.manage'];
  await createRole(deps, ANA, gid, {
    name: 'Admin',
    permissions,
    expectedVersion: (await listRoles(deps, ANA, gid)).version,
  });
  const admin = (await listRoles(deps, ANA, gid)).roles.find((r) => r.name === 'Admin')?.id ?? '';
  await setMemberRole(deps, ANA, gid, pub(BIA), { roleId: admin });
  ctx.notified.length = 0;
  const roleOf = async (viewer: UserId, target: UserId) =>
    (await members(deps, viewer, gid)).find((m) => m.user.id === pub(target))?.role;
  return { ...ctx, gid, admin, roleOf, to: (user: UserId) => ({ userPublicId: pub(user) }) };
}

describe('groups: passar o grupo', () => {
  it('GRV-49: só o Dono passa; quem não é recebe GROUP_OWNER_ONLY', async () => {
    const { deps, gid, to } = await withTeam();
    expect((await errorOf(transfer(deps, BIA, gid, to(CAIO))))?.code).toBe('GROUP_OWNER_ONLY');
    expect((await errorOf(transfer(deps, CAIO, gid, to(BIA))))?.code).toBe('GROUP_OWNER_ONLY');
  });

  it('GRV-49: o membro vira Dono e o dono antigo fica com o cargo criado que ele tinha', async () => {
    const { gid, to, admin, roleOf, deps } = await withTeam();
    await transfer(deps, ANA, gid, to(BIA));
    expect(await roleOf(BIA, BIA)).toEqual({ id: 'owner' });
    expect(await roleOf(BIA, ANA)).toEqual({ id: admin, name: 'Admin' });
    expect((await getGroup(deps, BIA, gid)).myRole).toEqual({ id: 'owner' });
    expect((await getGroup(deps, ANA, gid)).myRole).toEqual({ id: admin, name: 'Admin' });
  });

  it('GRV-49: se o novo dono estava no Todos, o dono antigo vai para o Todos', async () => {
    const { deps, gid, to, roleOf } = await withTeam();
    await transfer(deps, ANA, gid, to(CAIO));
    expect(await roleOf(CAIO, CAIO)).toEqual({ id: 'owner' });
    expect(await roleOf(CAIO, ANA)).toEqual({ id: 'everyone' });
  });

  it('GRV-49: o dono antigo perde as permissões de dono e o novo as ganha', async () => {
    const { deps, gid, to } = await withTeam();
    await transfer(deps, ANA, gid, to(CAIO));
    const version = async () => (await listRoles(deps, CAIO, gid)).version;
    // Ana (agora no Todos, sem roles.manage) não mexe em cargos; Caio (Dono) mexe.
    const denied = await errorOf(listRoles(deps, ANA, gid));
    expect(denied?.code).toBe('GROUP_PERMISSION_DENIED');
    await createRole(deps, CAIO, gid, { name: 'Novo', permissions: [], expectedVersion: await version() });
    expect((await listRoles(deps, CAIO, gid)).roles.map((r) => r.name)).toContain('Novo');
  });

  it('GRV-49: o dono antigo, agora Admin, não mexe no cargo de quem ficou acima dele (GROUP_ROLE_TOO_HIGH)', async () => {
    const { deps, gid, to } = await withTeam();
    await transfer(deps, ANA, gid, to(BIA));
    const err = await errorOf(setMemberRole(deps, ANA, gid, pub(BIA), { roleId: 'everyone' }));
    expect(err?.code).toBe('GROUP_ROLE_TOO_HIGH');
  });

  it('GRV-49: uma reserva ou si mesmo → VALIDATION_ERROR', async () => {
    const { deps, gid, to } = await withTeam();
    expect((await errorOf(transfer(deps, ANA, gid, to(DUDA))))?.code).toBe('VALIDATION_ERROR');
    expect((await errorOf(transfer(deps, ANA, gid, to(ANA))))?.code).toBe('VALIDATION_ERROR');
  });

  it('GRV-49: quem não participa, ou usuário que não existe → GROUP_MEMBER_NOT_FOUND', async () => {
    const { deps, gid, to } = await withTeam();
    const other = asUserId('55555555-5555-4555-8555-555555555555');
    PUBLIC[other] = asPublicUserId('5EEEEEEE');
    expect((await errorOf(transfer(deps, ANA, gid, to(other))))?.code).toBe('GROUP_MEMBER_NOT_FOUND');
    expect((await errorOf(transfer(deps, ANA, gid, { userPublicId: UNKNOWN })))?.code).toBe(
      'GROUP_MEMBER_NOT_FOUND',
    );
  });

  it('NTF-02/GRV-49: o novo dono recebe group_transferred com o link do grupo; ninguém mais é avisado', async () => {
    const { deps, gid, to, notified } = await withTeam();
    await transfer(deps, ANA, gid, to(BIA));
    expect(notified).toHaveLength(1);
    expect(notified[0]?.userId).toBe(BIA);
    expect(notified[0]?.input.type).toBe('group_transferred');
    expect(notified[0]?.input.link).toBe(`/groups/${gid}`);
  });

  it('GRV-49: erro não avisa ninguém', async () => {
    const { deps, gid, to, notified } = await withTeam();
    await errorOf(transfer(deps, BIA, gid, to(CAIO)));
    await errorOf(transfer(deps, ANA, gid, to(DUDA)));
    expect(notified).toHaveLength(0);
  });
});

describe('groups: sair depois de passar', () => {
  it('GRV-30: o dono antigo sai sem erro, e o novo dono não sai (GROUP_OWNER_NOT_REMOVABLE)', async () => {
    const { gid, to, deps } = await withTeam();
    expect((await errorOf(leaveGroup(deps, ANA, gid)))?.code).toBe('GROUP_OWNER_NOT_REMOVABLE');
    await transfer(deps, ANA, gid, to(BIA));
    expect(await errorOf(leaveGroup(deps, ANA, gid))).toBeUndefined();
    expect((await errorOf(getGroup(deps, ANA, gid)))?.code).toBe('GROUP_NOT_FOUND');
    expect((await errorOf(leaveGroup(deps, BIA, gid)))?.code).toBe('GROUP_OWNER_NOT_REMOVABLE');
  });
});

describe('groups: passar o grupo, corrida', () => {
  /** O repositório chama `before` e responde `conflict`, como se a participação tivesse mudado entre a leitura e a gravação. */
  const conflicting = (before: () => Promise<void>) => (repo: GroupRepository) =>
    ({
      ...repo,
      transferGroup: (async () => {
        await before();
        return 'conflict';
      }) as Transfer,
    }) as GroupRepository;

  it('GRV-49: o repositório recebe de quem, para quem, o cargo do novo dono e a hora', async () => {
    const seen: unknown[] = [];
    const wrap = (repo: GroupRepository) =>
      ({
        ...repo,
        transferGroup: (async (input: unknown) => {
          seen.push(input);
          return 'ok';
        }) as Transfer,
      }) as GroupRepository;
    const { deps, gid, to, admin } = await withTeam(wrap);
    await transfer(deps, ANA, gid, to(BIA));
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ fromUserId: ANA, toUserId: BIA, toRole: admin, now: T0 });
  });

  it('GRV-49: a pessoa saiu entre a leitura e a gravação → relê, responde GROUP_MEMBER_NOT_FOUND e não avisa', async () => {
    const leave = { run: async () => {} };
    const ctx = await withTeam(conflicting(() => leave.run()));
    leave.run = () => leaveGroup(ctx.deps, CAIO, ctx.gid);
    const err = await errorOf(transfer(ctx.deps, ANA, ctx.gid, ctx.to(CAIO)));
    expect(err?.code).toBe('GROUP_MEMBER_NOT_FOUND');
    expect(ctx.notified).toHaveLength(0);
    expect(await ctx.roleOf(ANA, ANA)).toEqual({ id: 'owner' });
  });
});
