import {
  CreateGroupInputSchema,
  GroupNameSchema,
  GroupRoleNameSchema,
  GroupRoleRefSchema,
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

  it('GRV-40: o cargo é o Dono, o Todos (sem nome) ou um criado (uuid e nome)', () => {
    expect(GroupRoleRefSchema.parse({ id: 'owner' })).toEqual({ id: 'owner' });
    expect(GroupRoleRefSchema.parse({ id: 'everyone' })).toEqual({ id: 'everyone' });
    const created = { id: '11111111-1111-4111-8111-111111111111', name: 'Admin' };
    expect(GroupRoleRefSchema.parse(created)).toEqual(created);
    expect(GroupRoleRefSchema.safeParse({ id: 'admin' }).success).toBe(false);
    expect(GroupRoleRefSchema.safeParse('owner').success).toBe(false);
  });

  it('GRV-44: o nome do cargo tem de 1 a 30 caracteres, sem os espaços das pontas', () => {
    expect(GroupRoleNameSchema.parse('  Admin  ')).toBe('Admin');
    expect(GroupRoleNameSchema.parse('a'.repeat(30))).toHaveLength(30);
    expect(GroupRoleNameSchema.safeParse('   ').success).toBe(false);
    expect(GroupRoleNameSchema.safeParse('a'.repeat(31)).success).toBe(false);
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
      myRole: { id: 'owner' },
      myPermissions: [],
      joinMode: 'invite',
      modality: 'mixed',
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
      myRole: { id: 'everyone' },
      myPermissions: ['group.edit'],
      joinMode: 'open',
      modality: 'mixed',
    };
    expect(GroupSchema.parse(full)).toMatchObject({
      myTier: 'reserve',
      myRole: { id: 'everyone' },
    });
    expect(GroupSchema.safeParse({ ...full, myPermissions: ['nope'] }).success).toBe(false);
  });
});
