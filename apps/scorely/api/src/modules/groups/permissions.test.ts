import { permissionsOf } from '@scorely/api/src/modules/groups/groups.deps';
import { type Permission, PermissionSchema, ROLES, RoleIdSchema } from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

// Cargos e permissões (docs/modules/grupos.md, GRP-48–52): a conta pura de quem pode o quê. O cargo é o `roleId`
// da participação (ADR 0015); o grupo não diz mais quem é o dono.

const EVERY_PERMISSION: Permission[] = [
  'game.manage',
  'members.manage',
  'results.record',
  'seasons.manage',
  'settings.edit',
  'teams.manage',
];
/** Aceita lista ou conjunto: o que importa é quais permissões saem. */
const sorted = (perms: Iterable<Permission>) => [...perms].sort();

describe('permissões do grupo (GRP-48–52)', () => {
  it('GRP-48: todo mundo tem exatamente um cargo, owner, admin ou member', () => {
    expect([...RoleIdSchema.options].sort()).toEqual(['admin', 'member', 'owner']);
    expect(RoleIdSchema.safeParse(undefined).success).toBe(false);
  });

  it('GRP-49: o cargo Dono tem todas as permissões', () => {
    expect(sorted(ROLES.owner.permissions)).toEqual(EVERY_PERMISSION);
    expect(sorted(permissionsOf('owner'))).toEqual(EVERY_PERMISSION);
  });

  it('GRP-49: o cargo Membro não tem nenhuma permissão', () => {
    expect([...ROLES.member.permissions]).toEqual([]);
    expect(sorted(permissionsOf('member'))).toEqual([]);
  });

  it('GRP-49: o catálogo tem as 6 permissões, com seasons.manage (o regulamento, CMP-07) e results.record (fechar os jogos, CMP-11)', () => {
    expect(sorted(PermissionSchema.options)).toEqual(EVERY_PERMISSION);
  });

  it('GRP-50: os cargos são três e fixos, e o Admin tem todas as permissões do catálogo', () => {
    expect(Object.keys(ROLES).sort()).toEqual(['admin', 'member', 'owner']);
    expect(sorted(ROLES.admin.permissions)).toEqual(EVERY_PERMISSION);
    expect(sorted(permissionsOf('admin'))).toEqual(EVERY_PERMISSION);
  });

  it('GRP-52: um cargo que não existe conta como o cargo Membro', () => {
    expect(sorted(permissionsOf('organizer'))).toEqual([]);
  });
});
