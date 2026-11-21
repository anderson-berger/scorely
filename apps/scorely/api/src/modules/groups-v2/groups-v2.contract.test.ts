import {
  CreateGroupV2InputSchema,
  GroupNameV2Schema,
  GroupRoleV2Schema,
  GroupV2Schema,
  PublicGroupIdSchema,
} from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

const PUBLIC = 'K3X9PQ2A';

describe('groups-v2 (contrato)', () => {
  it('GRV-01: o nome tem de 1 a 80 caracteres, sem os espaços das pontas', () => {
    expect(GroupNameV2Schema.parse('  Pelada de sexta  ')).toBe('Pelada de sexta');
    expect(GroupNameV2Schema.parse('a'.repeat(80))).toHaveLength(80);
    expect(GroupNameV2Schema.safeParse('').success).toBe(false);
    expect(GroupNameV2Schema.safeParse('   ').success).toBe(false);
    expect(GroupNameV2Schema.safeParse('a'.repeat(81)).success).toBe(false);
  });

  it('GRV-01: criar pede só o nome (sem esporte, horário, lugar, fuso, logo nem capa)', () => {
    const parsed = CreateGroupV2InputSchema.parse({
      name: 'Pelada',
      sport: 'futsal',
      timezone: 'UTC',
      logo: 'x',
    });
    expect(parsed).toEqual({ name: 'Pelada' });
    expect(CreateGroupV2InputSchema.safeParse({}).success).toBe(false);
  });

  it('GRV-15: os cargos são owner e member (o cargo base)', () => {
    expect(GroupRoleV2Schema.parse('owner')).toBe('owner');
    expect(GroupRoleV2Schema.parse('member')).toBe('member');
    expect(GroupRoleV2Schema.safeParse('admin').success).toBe(false);
  });

  it('GRV-08: o id público tem 8 caracteres Crockford base32 (sem I, L, O, U)', () => {
    expect(PublicGroupIdSchema.safeParse(PUBLIC).success).toBe(true);
    for (const bad of ['K3X9PQ2', 'K3X9PQ2AA', 'k3x9pq2a', 'K3X9PQ2I', 'K3X9PQ2L', 'K3X9PQ2O', 'K3X9PQ2U']) {
      expect(PublicGroupIdSchema.safeParse(bad).success, bad).toBe(false);
    }
  });

  it('GRV-08: o id do grupo na resposta é o público, não o uuid', () => {
    const base = {
      createdAt: '2026-11-20T10:00:00.000Z',
      version: 1,
      name: 'Pelada',
      myTier: 'member',
      myRole: 'owner',
      myPermissions: [],
    };
    expect(GroupV2Schema.safeParse({ ...base, id: PUBLIC }).success).toBe(true);
    expect(GroupV2Schema.safeParse({ ...base, id: '11111111-1111-4111-8111-111111111111' }).success).toBe(
      false,
    );
  });

  it('GRV-04: o grupo vem com a participação, o cargo e as permissões de quem pede', () => {
    const base = { id: PUBLIC, createdAt: '2026-11-20T10:00:00.000Z', version: 1, name: 'Pelada' };
    expect(GroupV2Schema.safeParse(base).success).toBe(false);
    const full = { ...base, myTier: 'reserve', myRole: 'member', myPermissions: ['group.edit'] };
    expect(GroupV2Schema.parse(full)).toMatchObject({ myTier: 'reserve', myRole: 'member' });
    expect(GroupV2Schema.safeParse({ ...full, myPermissions: ['nope'] }).success).toBe(false);
  });
});
