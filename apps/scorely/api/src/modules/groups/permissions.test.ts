import { asUserId } from '@scorely/api/src/lib/ids';
import type { StoredGroup } from '@scorely/api/src/modules/groups/group.repository';
import { permissionsOf } from '@scorely/api/src/modules/groups/groups.deps';
import { type Permission, PublicUserIdSchema, STAFF_ROLES } from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

// Cargos e permissões (docs/modules/grupos.md, GRP-48–52): a conta pura de quem pode o quê.

const OWNER = asUserId('11111111-1111-4111-8111-111111111111');
const A = asUserId('22222222-2222-4222-8222-222222222222');

const GROUP: StoredGroup = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  createdAt: '2026-01-01T00:00:00.000Z',
  name: 'Vôlei de sexta',
  sport: 'volleyball',
  weekday: 5,
  time: '19:00',
  timeZone: 'America/Sao_Paulo',
  slots: 12,
  listOpensHoursBefore: 48,
  reservesOpenHoursBefore: 24,
  ownerId: OWNER,
  ownerPublicId: PublicUserIdSchema.parse('11111111'),
  inviteToken: 'tok-member',
  reserveInviteToken: 'tok-reserve',
  guestToken: 'tok-guest',
  maxMembers: 30,
  maxReserves: 30,
};

const EVERY_PERMISSION: Permission[] = ['game.manage', 'members.manage', 'settings.edit', 'teams.manage'];
/** Aceita lista ou conjunto: o que importa é quais permissões saem. */
const sorted = (perms: Iterable<Permission>) => [...perms].sort();

describe('permissões do grupo (GRP-49–52)', () => {
  it('GRP-49: o dono tem todas as permissões, com ou sem cargo gravado', () => {
    expect(sorted(permissionsOf(GROUP, OWNER, undefined))).toEqual(EVERY_PERMISSION);
    expect(sorted(permissionsOf(GROUP, OWNER, 'admin'))).toEqual(EVERY_PERMISSION);
  });

  it('GRP-49: quem não tem cargo não tem nenhuma permissão', () => {
    expect(sorted(permissionsOf(GROUP, A, undefined))).toEqual([]);
  });

  it('GRP-50: o cargo Admin tem as quatro permissões do catálogo', () => {
    expect(STAFF_ROLES.admin.name).toBe('Admin');
    expect(sorted(STAFF_ROLES.admin.permissions)).toEqual(EVERY_PERMISSION);
    expect(sorted(permissionsOf(GROUP, A, 'admin'))).toEqual(EVERY_PERMISSION);
  });

  it('GRP-52: um cargo que não existe mais conta como "sem cargo"', () => {
    expect(sorted(permissionsOf(GROUP, A, 'organizer' as never))).toEqual([]);
  });
});
