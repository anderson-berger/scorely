import type { UserId } from '@scorely/api/src/lib/ids';
import { asPublicUserId, asUserId } from '@scorely/api/src/lib/ids';
import { createGroup, getGroup } from '@scorely/api/src/modules/groups/rules/groups';
import {
  createInvite,
  joinByInvite,
  listInvites,
  revokeInvite,
} from '@scorely/api/src/modules/groups/rules/invites';
import { leave, members, removeMember } from '@scorely/api/src/modules/groups/rules/members';
import {
  createRole as createGroupRole,
  deleteRole,
  listRoles,
  orderRoles,
  setMemberRole,
  updateRole,
} from '@scorely/api/src/modules/groups/rules/roles';
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

// Cargos (GRV-40–48) e a ordem nas ações de hoje (GRV-19, 20, 29, 31). As telas (GRV-50, 51) ficam no roteiro
// manual. Passar o grupo (GRV-49) é da etapa C.
//
// Interface assumida do service (não existe ainda; o doc só define as rotas):
//   roles(actor, gid) · createRole(actor, gid, input) · updateRole(actor, gid, roleId, input)
//   orderRoles(actor, gid, input) · deleteRole(actor, gid, roleId, input)
//   setMemberRole(actor, gid, userPublicId, input)

const T0 = new Date('2026-11-22T10:00:00.000Z');
const MISSING = '99999999-9999-4999-8999-999999999999';
const MEMBER_INVITE = { tier: 'member', validityDays: 7, maxUses: null } as const;

function pub(id: UserId) {
  return PUBLIC[id] ?? asPublicUserId('0ZZZZZZZ');
}

function setup() {
  return setupGroups({ now: T0 });
}

/** Grupo da Ana. */
async function withGroup() {
  const ctx = setup();
  const group = await createGroup(ctx.deps, ANA, { name: 'Pelada' });
  const gid = group.id;
  const version = async () => (await listRoles(ctx.deps, ANA, gid)).version;

  /** Cria o cargo (como `actor`, com a versão atual) e devolve o id dele. */
  const createRole = async (actor: UserId, name: string, permissions: GroupPermission[]) => {
    await createGroupRole(ctx.deps, actor, gid, { name, permissions, expectedVersion: await version() });
    const created = (await listRoles(ctx.deps, ANA, gid)).roles.find((r) => r.name === name);
    return created?.id ?? '';
  };
  /** Entra como membro pelo convite da Ana. */
  const join = async (user: UserId) => {
    const invite = await createInvite(ctx.deps, ANA, gid, MEMBER_INVITE);
    await joinByInvite(ctx.deps, user, invite.token);
  };
  const setRole = (actor: UserId, target: UserId, roleId: string) =>
    setMemberRole(ctx.deps, actor, gid, pub(target), { roleId });
  const roleOf = async (viewer: UserId, target: UserId) =>
    (await members(ctx.deps, viewer, gid)).find((m) => m.user.id === pub(target));
  const names = async () => (await listRoles(ctx.deps, ANA, gid)).roles.map((r) => r.name ?? r.id);
  return { ...ctx, gid, version, createRole, join, setRole, roleOf, names };
}

/**
 * Ana (Dono), Bia (Admin: invite, remove, roles.manage), Caio (Ajudante: invite), Duda (Todos).
 * Ordem: Dono, Admin, Ajudante, Todos.
 */
async function withTeam() {
  const ctx = await withGroup();
  await ctx.join(BIA);
  await ctx.join(CAIO);
  await ctx.join(DUDA);
  const admin = await ctx.createRole(ANA, 'Admin', ['members.invite', 'members.remove', 'roles.manage']);
  const helper = await ctx.createRole(ANA, 'Ajudante', ['members.invite']);
  await ctx.setRole(ANA, BIA, admin);
  await ctx.setRole(ANA, CAIO, helper);
  ctx.notified.length = 0;
  return { ...ctx, admin, helper };
}

describe('groups cargos: base', () => {
  it('GRV-02: o grupo nasce com os dois cargos fixos, o Todos sem permissão, e a Ana como Dono', async () => {
    const { gid, deps } = await withGroup();
    const { roles } = await listRoles(deps, ANA, gid);
    expect(roles.map((r) => r.id)).toEqual(['owner', 'everyone']);
    expect(roles[1]).toMatchObject({ permissions: [], members: 0, fixed: 'everyone' });
    expect(roles[0]).toMatchObject({ members: 1, fixed: 'owner' });
    expect((await getGroup(deps, ANA, gid)).myRole).toEqual({ id: 'owner' });
    expect((await members(deps, ANA, gid))[0]?.role).toEqual({ id: 'owner' });
  });

  it('GRV-40: quem entra por convite entra no Todos', async () => {
    const { join, roleOf } = await withGroup();
    await join(BIA);
    expect((await roleOf(ANA, BIA))?.role).toEqual({ id: 'everyone' });
  });

  it('GRV-15: roles.manage é uma permissão do catálogo, e o Dono tem todas', async () => {
    const { gid, deps } = await withGroup();
    expect((await getGroup(deps, ANA, gid)).myPermissions.sort()).toEqual([
      'competitions.manage',
      'group.edit',
      'matches.manage',
      'members.invite',
      'members.remove',
      'roles.manage',
    ]);
  });

  it('GRV-15: quem participa sem a permissão recebe GROUP_PERMISSION_DENIED com a permissão', async () => {
    const { deps, gid, join, version } = await withGroup();
    await join(BIA);
    const err = await errorOf(
      createGroupRole(deps, BIA, gid, { name: 'X', permissions: [], expectedVersion: await version() }),
    );
    expect(err?.code).toBe('GROUP_PERMISSION_DENIED');
    expect(err?.details).toEqual({ permission: 'roles.manage' });
  });

  it('GRV-41: dar uma permissão ao Todos vale para todo mundo, e o cargo criado soma com ela', async () => {
    const { gid, version, deps } = await withTeam();
    await updateRole(deps, ANA, gid, 'everyone', {
      name: 'ignored',
      permissions: ['group.edit'],
      expectedVersion: await version(),
    });
    expect((await getGroup(deps, DUDA, gid)).myPermissions).toEqual(['group.edit']);
    expect((await getGroup(deps, CAIO, gid)).myPermissions.sort()).toEqual(['group.edit', 'members.invite']);
  });

  it('GRV-41: o cargo apagado deixa de valer (volta ao Todos) na próxima ação', async () => {
    const { gid, helper, version, deps } = await withTeam();
    expect((await getGroup(deps, CAIO, gid)).myPermissions).toEqual(['members.invite']);
    await deleteRole(deps, ANA, gid, helper, { expectedVersion: await version() });
    expect((await getGroup(deps, CAIO, gid)).myPermissions).toEqual([]);
  });
});

describe('groups cargos: lista e criar (GRV-42, 44)', () => {
  it('GRV-42: quem tem roles.manage vê Dono, os criados na ordem e o Todos, com a contagem e a version', async () => {
    const { deps, gid, admin, helper } = await withTeam();
    const list = await listRoles(deps, BIA, gid);
    expect(list.roles.map((r) => r.id)).toEqual(['owner', admin, helper, 'everyone']);
    expect(list.roles.map((r) => r.members)).toEqual([1, 1, 1, 1]);
    expect(list.roles[1]).toMatchObject({
      name: 'Admin',
      permissions: ['members.invite', 'members.remove', 'roles.manage'],
    });
    expect(list.roles[0]?.name).toBeUndefined();
    expect(list.roles[3]?.name).toBeUndefined();
    expect(list.version).toBe((await listRoles(deps, ANA, gid)).version);
  });

  it('GRV-42/43: manageable é só do que está abaixo de quem pede', async () => {
    const { deps, gid } = await withTeam();
    expect((await listRoles(deps, BIA, gid)).roles.map((r) => r.manageable)).toEqual([
      false,
      false,
      true,
      true,
    ]);
    expect((await listRoles(deps, ANA, gid)).roles.map((r) => r.manageable)).toEqual([
      false,
      true,
      true,
      true,
    ]);
  });

  it('GRV-42: sem roles.manage → GROUP_PERMISSION_DENIED; quem não participa → GROUP_NOT_FOUND', async () => {
    const { deps, gid } = await withTeam();
    expect((await errorOf(listRoles(deps, CAIO, gid)))?.code).toBe('GROUP_PERMISSION_DENIED');
    expect(
      (await errorOf(listRoles(deps, asUserId('55555555-5555-4555-8555-555555555555'), gid)))?.code,
    ).toBe('GROUP_NOT_FOUND');
  });

  it('GRV-44: o cargo novo entra logo acima do Todos, e a version sobe', async () => {
    const { createRole, names, version } = await withGroup();
    const before = await version();
    await createRole(ANA, 'A', []);
    await createRole(ANA, 'B', []);
    expect(await names()).toEqual(['owner', 'A', 'B', 'everyone']);
    expect(await version()).toBeGreaterThan(before);
  });

  it('GRV-44: nome repetido (sem maiúsculas e acentos), "Dono" e "Todos" → GROUP_ROLE_NAME_TAKEN (409)', async () => {
    const { deps, gid, createRole, version } = await withGroup();
    await createRole(ANA, 'Árbitro', []);
    const attempt = async (name: string) =>
      errorOf(createGroupRole(deps, ANA, gid, { name, permissions: [], expectedVersion: await version() }));
    for (const name of ['arbitro', 'ÁRBITRO', 'Dono', 'todos', 'DONO']) {
      const err = await attempt(name);
      expect(err?.code, name).toBe('GROUP_ROLE_NAME_TAKEN');
      expect(err?.status).toBe(409);
    }
  });

  it('GRV-44: só dá as permissões que tem; outra → GROUP_PERMISSION_DENIED com a permissão', async () => {
    const { deps, gid, version } = await withTeam();
    const denied = await errorOf(
      createGroupRole(deps, BIA, gid, {
        name: 'Z',
        permissions: ['group.edit'],
        expectedVersion: await version(),
      }),
    );
    expect(denied?.code).toBe('GROUP_PERMISSION_DENIED');
    expect(denied?.details).toEqual({ permission: 'group.edit' });
    const ok = await errorOf(
      createGroupRole(deps, BIA, gid, {
        name: 'Convidador',
        permissions: ['members.invite'],
        expectedVersion: await version(),
      }),
    );
    expect(ok).toBeUndefined();
  });

  it('GRV-44: o 21º cargo criado → GROUP_ROLE_LIMIT (409) com details.limit = 20', async () => {
    const { deps, gid, version } = await withGroup();
    for (const n of Array.from({ length: 20 }, (_, i) => i)) {
      await createGroupRole(deps, ANA, gid, {
        name: `Cargo ${n}`,
        permissions: [],
        expectedVersion: await version(),
      });
    }
    const err = await errorOf(
      createGroupRole(deps, ANA, gid, { name: 'Mais um', permissions: [], expectedVersion: await version() }),
    );
    expect(err?.code).toBe('GROUP_ROLE_LIMIT');
    expect(err?.status).toBe(409);
    expect(err?.details).toEqual({ limit: 20 });
  });

  it('GRV-44: version velha → VERSION_CONFLICT com a version atual (ADR 0016)', async () => {
    const { deps, gid, createRole, version } = await withGroup();
    const stale = await version();
    await createRole(ANA, 'A', []);
    const err = await errorOf(
      createGroupRole(deps, ANA, gid, { name: 'B', permissions: [], expectedVersion: stale }),
    );
    expect(err?.code).toBe('VERSION_CONFLICT');
    expect(err?.details).toEqual({ currentVersion: await version() });
  });
});

describe('groups cargos: editar, ordenar e apagar (GRV-43, 45–47)', () => {
  it('GRV-45: edita nome e permissões de um cargo abaixo do seu', async () => {
    const { gid, helper, version, names, deps } = await withTeam();
    await updateRole(deps, BIA, gid, helper, {
      name: 'Ajudante 2',
      permissions: [],
      expectedVersion: await version(),
    });
    expect(await names()).toEqual(['owner', expect.any(String), 'Ajudante 2', 'everyone']);
    expect((await getGroup(deps, CAIO, gid)).myPermissions).toEqual([]);
  });

  it('GRV-43/45: editar o próprio cargo ou um acima → GROUP_ROLE_TOO_HIGH (403)', async () => {
    const { deps, gid, admin, helper, version } = await withTeam();
    const own = await errorOf(
      updateRole(deps, BIA, gid, admin, {
        name: 'Admin',
        permissions: [],
        expectedVersion: await version(),
      }),
    );
    expect(own?.code).toBe('GROUP_ROLE_TOO_HIGH');
    expect(own?.status).toBe(403);
    await updateRole(deps, ANA, gid, helper, {
      name: 'Ajudante',
      permissions: ['members.invite', 'roles.manage'],
      expectedVersion: await version(),
    });
    const above = await errorOf(
      updateRole(deps, CAIO, gid, admin, {
        name: 'Admin',
        permissions: [],
        expectedVersion: await version(),
      }),
    );
    expect(above?.code).toBe('GROUP_ROLE_TOO_HIGH');
  });

  it('GRV-45: só marca ou desmarca o que tem; mudar o que não tem → GROUP_PERMISSION_DENIED; manter fica ok', async () => {
    const { deps, gid, createRole, version } = await withTeam();
    const treasurer = await createRole(ANA, 'Tesoureiro', ['group.edit']);
    const denied = await errorOf(
      updateRole(deps, BIA, gid, treasurer, {
        name: 'Tesoureiro',
        permissions: [],
        expectedVersion: await version(),
      }),
    );
    expect(denied?.code).toBe('GROUP_PERMISSION_DENIED');
    expect(denied?.details).toEqual({ permission: 'group.edit' });
    await updateRole(deps, BIA, gid, treasurer, {
      name: 'Tesoureiro 2',
      permissions: ['group.edit', 'members.invite'],
      expectedVersion: await version(),
    });
    const edited = (await listRoles(deps, ANA, gid)).roles.find((r) => r.id === treasurer);
    expect(edited).toMatchObject({ name: 'Tesoureiro 2' });
    expect(edited?.permissions.sort()).toEqual(['group.edit', 'members.invite']);
  });

  it('GRV-45: nome repetido ao editar → GROUP_ROLE_NAME_TAKEN', async () => {
    const { deps, gid, helper, version } = await withTeam();
    const err = await errorOf(
      updateRole(deps, ANA, gid, helper, {
        name: 'admin',
        permissions: ['members.invite'],
        expectedVersion: await version(),
      }),
    );
    expect(err?.code).toBe('GROUP_ROLE_NAME_TAKEN');
  });

  it('GRV-45: no Todos só as permissões mudam (o nome é ignorado)', async () => {
    const { deps, gid, version } = await withTeam();
    await updateRole(deps, BIA, gid, 'everyone', {
      name: 'Qualquer',
      permissions: ['members.invite'],
      expectedVersion: await version(),
    });
    const everyone = (await listRoles(deps, ANA, gid)).roles.find((r) => r.id === 'everyone');
    expect(everyone?.name).toBeUndefined();
    expect(everyone?.permissions).toEqual(['members.invite']);
  });

  it('GRV-45: o Todos não recebe members.remove nem roles.manage → VALIDATION_ERROR', async () => {
    const { deps, gid, version } = await withTeam();
    for (const permission of ['members.remove', 'roles.manage'] as const) {
      const err = await errorOf(
        updateRole(deps, ANA, gid, 'everyone', {
          name: 'x',
          permissions: [permission],
          expectedVersion: await version(),
        }),
      );
      expect(err?.code, permission).toBe('VALIDATION_ERROR');
    }
  });

  it('GRV-45: a mudança vale na próxima ação de quem tem o cargo', async () => {
    const { deps, gid, helper, version } = await withTeam();
    expect(await errorOf(listInvites(deps, CAIO, gid))).toBeUndefined();
    await updateRole(deps, ANA, gid, helper, {
      name: 'Ajudante',
      permissions: [],
      expectedVersion: await version(),
    });
    expect((await errorOf(listInvites(deps, CAIO, gid)))?.code).toBe('GROUP_PERMISSION_DENIED');
  });

  it('GRV-45: editar com version velha → VERSION_CONFLICT; cargo que não existe → GROUP_ROLE_NOT_FOUND', async () => {
    const { deps, gid, helper, version } = await withTeam();
    const stale = await version();
    await updateRole(deps, ANA, gid, helper, {
      name: 'Ajudante',
      permissions: ['members.invite'],
      expectedVersion: stale,
    });
    const conflict = await errorOf(
      updateRole(deps, ANA, gid, helper, { name: 'Outro', permissions: [], expectedVersion: stale }),
    );
    expect(conflict?.code).toBe('VERSION_CONFLICT');
    const missing = await errorOf(
      updateRole(deps, ANA, gid, MISSING, { name: 'N', permissions: [], expectedVersion: await version() }),
    );
    expect(missing?.code).toBe('GROUP_ROLE_NOT_FOUND');
    expect(missing?.status).toBe(404);
  });

  it('GRV-46: o Dono ordena todos os cargos criados', async () => {
    const { deps, gid, admin, helper, version } = await withTeam();
    await orderRoles(deps, ANA, gid, { roleIds: [helper, admin], expectedVersion: await version() });
    expect((await listRoles(deps, ANA, gid)).roles.map((r) => r.id)).toEqual([
      'owner',
      helper,
      admin,
      'everyone',
    ]);
  });

  it('GRV-46: quem ordena mexe só entre os cargos abaixo do seu; os de cima e o próprio ficam', async () => {
    const { deps, gid, admin, helper, createRole, version } = await withTeam();
    const c = await createRole(ANA, 'C', []);
    const d = await createRole(ANA, 'D', []);
    // Ordem atual: Admin (Bia), Ajudante, C, D. Bia reordena só os três de baixo.
    await orderRoles(deps, BIA, gid, { roleIds: [admin, d, c, helper], expectedVersion: await version() });
    expect((await listRoles(deps, ANA, gid)).roles.map((r) => r.id)).toEqual([
      'owner',
      admin,
      d,
      c,
      helper,
      'everyone',
    ]);
  });

  it('GRV-46: uma lista que não tem exatamente os cargos criados → VALIDATION_ERROR', async () => {
    const { deps, gid, admin, helper, version } = await withTeam();
    for (const roleIds of [
      [admin],
      [admin, helper, MISSING],
      [admin, admin, helper],
      [admin, helper, helper],
    ]) {
      const err = await errorOf(orderRoles(deps, ANA, gid, { roleIds, expectedVersion: await version() }));
      expect(err?.code, roleIds.join()).toBe('VALIDATION_ERROR');
    }
  });

  it('GRV-46: ordenar com version velha → VERSION_CONFLICT', async () => {
    const { deps, gid, admin, helper, version } = await withTeam();
    const stale = (await version()) - 1;
    const err = await errorOf(
      orderRoles(deps, ANA, gid, { roleIds: [helper, admin], expectedVersion: stale }),
    );
    expect(err?.code).toBe('VERSION_CONFLICT');
  });

  it('GRV-47: apagar tira o cargo da lista e as pessoas voltam para o Todos, sem aviso', async () => {
    const { deps, gid, helper, version, roleOf, notified } = await withTeam();
    await deleteRole(deps, ANA, gid, helper, { expectedVersion: await version() });
    expect((await listRoles(deps, ANA, gid)).roles.map((r) => r.id)).not.toContain(helper);
    expect((await roleOf(ANA, CAIO))?.role).toEqual({ id: 'everyone' });
    expect((await listRoles(deps, ANA, gid)).roles.find((r) => r.id === 'everyone')?.members).toBe(2);
    expect(notified).toHaveLength(0);
  });

  it('GRV-43/47: apagar o próprio cargo ou um acima → GROUP_ROLE_TOO_HIGH', async () => {
    const { deps, gid, admin, version } = await withTeam();
    expect(
      (await errorOf(deleteRole(deps, BIA, gid, admin, { expectedVersion: await version() })))?.code,
    ).toBe('GROUP_ROLE_TOO_HIGH');
  });

  it('GRV-47: cargo que não existe → GROUP_ROLE_NOT_FOUND (404); version velha → VERSION_CONFLICT; o Todos e o Dono não se apagam', async () => {
    const { deps, gid, helper, version } = await withTeam();
    const missing = await errorOf(deleteRole(deps, ANA, gid, MISSING, { expectedVersion: await version() }));
    expect(missing?.code).toBe('GROUP_ROLE_NOT_FOUND');
    expect(missing?.status).toBe(404);
    const stale = await errorOf(
      deleteRole(deps, ANA, gid, helper, { expectedVersion: (await version()) - 1 }),
    );
    expect(stale?.code).toBe('VERSION_CONFLICT');
    expect(
      await errorOf(deleteRole(deps, ANA, gid, 'owner', { expectedVersion: await version() })),
    ).toBeDefined();
    expect(
      await errorOf(deleteRole(deps, ANA, gid, 'everyone', { expectedVersion: await version() })),
    ).toBeDefined();
  });
});

describe('groups cargos: mudar o cargo de alguém (GRV-48)', () => {
  it('GRV-48: põe uma pessoa abaixo num cargo abaixo; a resposta da lista traz o cargo com id e nome', async () => {
    const { gid, helper, setRole, roleOf, deps } = await withTeam();
    await setRole(BIA, DUDA, helper);
    expect((await roleOf(ANA, DUDA))?.role).toEqual({ id: helper, name: 'Ajudante' });
    expect((await getGroup(deps, DUDA, gid)).myRole).toEqual({ id: helper, name: 'Ajudante' });
  });

  it('GRV-48: voltar para o Todos funciona, sem aviso', async () => {
    const { setRole, roleOf, notified } = await withTeam();
    await setRole(BIA, CAIO, 'everyone');
    expect((await roleOf(ANA, CAIO))?.role).toEqual({ id: 'everyone' });
    expect(notified).toHaveLength(0);
  });

  it('NTF-02/GRV-48: quem recebe um cargo criado é avisado (group_role_granted, com o nome e o link do grupo)', async () => {
    const { setRole, helper, notified, gid } = await withTeam();
    await setRole(ANA, DUDA, helper);
    expect(notified).toHaveLength(1);
    expect(notified[0]?.userId).toBe(DUDA);
    expect(notified[0]?.input.type).toBe('group_role_granted');
    expect(notified[0]?.input.link).toBe(`/groups/${gid}`);
    expect(JSON.stringify(notified[0]?.input)).toContain('Ajudante');
  });

  it('GRV-48: mudar para o cargo que a pessoa já tem não muda nada e não avisa', async () => {
    const { setRole, helper, roleOf, notified } = await withTeam();
    await setRole(ANA, CAIO, helper);
    expect((await roleOf(ANA, CAIO))?.role).toEqual({ id: helper, name: 'Ajudante' });
    expect(notified).toHaveLength(0);
  });

  it('GRV-48/43: mudar a si mesmo → GROUP_ROLE_TOO_HIGH, nem o Dono', async () => {
    const { setRole, helper } = await withTeam();
    expect((await errorOf(setRole(BIA, BIA, 'everyone')))?.code).toBe('GROUP_ROLE_TOO_HIGH');
    expect((await errorOf(setRole(ANA, ANA, helper)))?.code).toBe('GROUP_ROLE_TOO_HIGH');
  });

  it('GRV-48/43: a pessoa e o cargo novo precisam estar abaixo de quem muda', async () => {
    const { setRole, admin, helper, roleOf } = await withTeam();
    expect((await errorOf(setRole(BIA, DUDA, admin)))?.code).toBe('GROUP_ROLE_TOO_HIGH');
    expect((await errorOf(setRole(BIA, ANA, helper)))?.code).toBe('GROUP_ROLE_TOO_HIGH');
    expect((await roleOf(ANA, ANA))?.role).toEqual({ id: 'owner' });
    expect(await errorOf(setRole(ANA, BIA, 'everyone'))).toBeUndefined();
    expect((await roleOf(ANA, BIA))?.role).toEqual({ id: 'everyone' });
  });

  it('GRV-48: quem está no mesmo cargo não é abaixo', async () => {
    const { setRole, admin, createRole } = await withTeam();
    await setRole(ANA, DUDA, admin);
    const other = await createRole(ANA, 'Outro', []);
    expect((await errorOf(setRole(BIA, DUDA, other)))?.code).toBe('GROUP_ROLE_TOO_HIGH');
  });

  it('GRV-48: quem não participa → GROUP_MEMBER_NOT_FOUND; cargo que não existe → GROUP_ROLE_NOT_FOUND', async () => {
    const { setRole } = await withTeam();
    const stranger = asUserId('55555555-5555-4555-8555-555555555555');
    PUBLIC[stranger] = asPublicUserId('5EEEEEEE');
    expect((await errorOf(setRole(ANA, stranger, 'everyone')))?.code).toBe('GROUP_MEMBER_NOT_FOUND');
    expect((await errorOf(setRole(ANA, DUDA, MISSING)))?.code).toBe('GROUP_ROLE_NOT_FOUND');
  });

  it('GRV-48: sem roles.manage → GROUP_PERMISSION_DENIED', async () => {
    const { setRole } = await withTeam();
    const err = await errorOf(setRole(CAIO, DUDA, 'everyone'));
    expect(err?.code).toBe('GROUP_PERMISSION_DENIED');
    expect(err?.details).toEqual({ permission: 'roles.manage' });
  });

  it('GRV-48: a última escolha vale e não pede version', async () => {
    const { setRole, helper, admin, roleOf } = await withTeam();
    await setRole(ANA, DUDA, helper);
    await setRole(ANA, DUDA, admin);
    expect((await roleOf(ANA, DUDA))?.role).toEqual({ id: admin, name: 'Admin' });
  });
});

describe('groups cargos: a ordem nas ações de hoje (GRV-19, 20, 29, 31)', () => {
  it('GRV-29: cada pessoa vem com manageable: só quem está abaixo de quem pede', async () => {
    const { deps, gid } = await withTeam();
    const flags = (viewer: UserId) =>
      members(deps, viewer, gid).then((l) => l.map((m) => [m.user.nickname, m.manageable]));
    expect(await flags(ANA)).toEqual([
      ['ana', false],
      ['bia', true],
      ['caio', true],
      ['duda', true],
    ]);
    expect(await flags(BIA)).toEqual([
      ['ana', false],
      ['bia', false],
      ['caio', true],
      ['duda', true],
    ]);
    expect(await flags(DUDA)).toEqual([
      ['ana', false],
      ['bia', false],
      ['caio', false],
      ['duda', false],
    ]);
  });

  it('GRV-31: remover alguém abaixo funciona; do mesmo cargo ou acima → GROUP_ROLE_TOO_HIGH', async () => {
    const { deps, gid, setRole, admin } = await withTeam();
    const up = await errorOf(removeMember(deps, BIA, gid, pub(ANA)));
    expect(up?.code).toBe('GROUP_ROLE_TOO_HIGH');
    await setRole(ANA, DUDA, admin);
    expect((await errorOf(removeMember(deps, BIA, gid, pub(DUDA))))?.code).toBe('GROUP_ROLE_TOO_HIGH');
    expect(await errorOf(removeMember(deps, BIA, gid, pub(CAIO)))).toBeUndefined();
    expect((await members(deps, ANA, gid)).map((m) => m.user.nickname)).toEqual(['ana', 'bia', 'duda']);
  });

  it('GRV-19: cada convite vem com manageable (os próprios e os de quem está abaixo)', async () => {
    const { deps, gid } = await withTeam();
    const own = await createInvite(deps, BIA, gid, MEMBER_INVITE);
    const anas = await createInvite(deps, ANA, gid, MEMBER_INVITE);
    const caios = await createInvite(deps, CAIO, gid, MEMBER_INVITE);
    const byBia = new Map((await listInvites(deps, BIA, gid)).map((i) => [i.id, i.manageable]));
    expect(byBia.get(own.id)).toBe(true);
    expect(byBia.get(anas.id)).toBe(false);
    expect(byBia.get(caios.id)).toBe(true);
    const byCaio = new Map((await listInvites(deps, CAIO, gid)).map((i) => [i.id, i.manageable]));
    expect(byCaio.get(own.id)).toBe(false);
    expect(byCaio.get(caios.id)).toBe(true);
    expect((await listInvites(deps, ANA, gid)).every((i) => i.manageable)).toBe(true);
  });

  it('GRV-20: cancela o próprio e o de quem está abaixo; o de outro → GROUP_ROLE_TOO_HIGH', async () => {
    const { deps, gid } = await withTeam();
    const bias = await createInvite(deps, BIA, gid, MEMBER_INVITE);
    const caios = await createInvite(deps, CAIO, gid, MEMBER_INVITE);
    const anas = await createInvite(deps, ANA, gid, MEMBER_INVITE);
    const above = await errorOf(revokeInvite(deps, CAIO, gid, bias.id));
    expect(above?.code).toBe('GROUP_ROLE_TOO_HIGH');
    expect(above?.status).toBe(403);
    expect((await errorOf(revokeInvite(deps, BIA, gid, anas.id)))?.code).toBe('GROUP_ROLE_TOO_HIGH');
    expect(await errorOf(revokeInvite(deps, CAIO, gid, caios.id))).toBeUndefined();
    expect(await errorOf(revokeInvite(deps, BIA, gid, bias.id))).toBeUndefined();
    expect(await errorOf(revokeInvite(deps, ANA, gid, anas.id))).toBeUndefined();
    const created = new Set([bias.id, caios.id, anas.id]);
    expect((await listInvites(deps, ANA, gid)).filter((i) => created.has(i.id)).map((i) => i.status)).toEqual(
      ['revoked', 'revoked', 'revoked'],
    );
  });

  it('GRV-20: o Dono cancela todos', async () => {
    const { deps, gid } = await withTeam();
    const bias = await createInvite(deps, BIA, gid, MEMBER_INVITE);
    expect(await errorOf(revokeInvite(deps, ANA, gid, bias.id))).toBeUndefined();
  });

  it('GRV-20: o convite de quem saiu conta como do Todos (cancela quem tem members.invite acima dele)', async () => {
    const { deps, gid, version } = await withTeam();
    const bias = await createInvite(deps, BIA, gid, MEMBER_INVITE);
    const caios = await createInvite(deps, CAIO, gid, MEMBER_INVITE);
    await leave(deps, BIA, gid);
    await leave(deps, CAIO, gid);
    await updateRole(deps, ANA, gid, 'everyone', {
      name: 'x',
      permissions: ['members.invite'],
      expectedVersion: await version(),
    });
    // Duda (Todos, com members.invite pelo Todos) está no mesmo nível do convite de quem saiu: não cancela.
    expect((await errorOf(revokeInvite(deps, DUDA, gid, bias.id)))?.code).toBe('GROUP_ROLE_TOO_HIGH');
    expect(await errorOf(revokeInvite(deps, ANA, gid, bias.id))).toBeUndefined();
    expect(await errorOf(revokeInvite(deps, ANA, gid, caios.id))).toBeUndefined();
  });

  it('GRV-20: quem tem um cargo acima do Todos cancela o convite de quem saiu', async () => {
    const { deps, gid } = await withTeam();
    const bias = await createInvite(deps, BIA, gid, MEMBER_INVITE);
    await leave(deps, BIA, gid);
    expect(await errorOf(revokeInvite(deps, CAIO, gid, bias.id))).toBeUndefined();
  });

  it('GRV-43: ver as pessoas não pede cargo: quem está no Todos vê a lista de membros', async () => {
    const { deps, gid } = await withTeam();
    expect((await members(deps, DUDA, gid)).length).toBe(4);
  });
});
