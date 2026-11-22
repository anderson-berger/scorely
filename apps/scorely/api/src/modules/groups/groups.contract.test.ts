import {
  CreateGroupInputSchema,
  GroupNameSchema,
  GroupRoleSchema,
  GroupSchema,
  PublicGroupIdSchema,
} from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

const PUBLIC = 'K3X9PQ2A';

describe('groups (contrato)', () => {
  it('GRV-01: o nome tem de 1 a 80 caracteres, sem os espaços das pontas', () => {
    expect(GroupNameSchema.parse('  Pelada de sexta  ')).toBe('Pelada de sexta');
    expect(GroupNameSchema.parse('a'.repeat(80))).toHaveLength(80);
    expect(GroupNameSchema.safeParse('').success).toBe(false);
    expect(GroupNameSchema.safeParse('   ').success).toBe(false);
    expect(GroupNameSchema.safeParse('a'.repeat(81)).success).toBe(false);
  });

  it('GRV-01: criar pede só o nome (sem esporte, horário, lugar, fuso, logo nem capa)', () => {
    const parsed = CreateGroupInputSchema.parse({
      name: 'Pelada',
      sport: 'futsal',
      timezone: 'UTC',
      logo: 'x',
    });
    expect(parsed).toEqual({ name: 'Pelada' });
    expect(CreateGroupInputSchema.safeParse({}).success).toBe(false);
  });

  it('GRV-15: os cargos são owner e member (o cargo base)', () => {
    expect(GroupRoleSchema.parse('owner')).toBe('owner');
    expect(GroupRoleSchema.parse('member')).toBe('member');
    expect(GroupRoleSchema.safeParse('admin').success).toBe(false);
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
      joinMode: 'invite',
    };
    expect(GroupSchema.safeParse({ ...base, id: PUBLIC }).success).toBe(true);
    expect(
      GroupSchema.safeParse({
        ...base,
        id: '11111111-1111-4111-8111-111111111111',
      }).success,
    ).toBe(false);
  });

  it('GRV-04: o grupo vem com a participação, o cargo e as permissões de quem pede', () => {
    const base = {
      id: PUBLIC,
      createdAt: '2026-11-20T10:00:00.000Z',
      version: 1,
      name: 'Pelada',
    };
    expect(GroupSchema.safeParse(base).success).toBe(false);
    const full = {
      ...base,
      myTier: 'reserve',
      myRole: 'member',
      myPermissions: ['group.edit'],
      joinMode: 'open',
    };
    expect(GroupSchema.parse(full)).toMatchObject({
      myTier: 'reserve',
      myRole: 'member',
    });
    expect(GroupSchema.safeParse({ ...full, myPermissions: ['nope'] }).success).toBe(false);
  });
});
