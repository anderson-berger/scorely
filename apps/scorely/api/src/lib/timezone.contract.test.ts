import {
  CreateGroupInputSchema,
  GroupSchema,
  PreferencesSchema,
  UpdateMeInputSchema,
} from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

/** Contrato (plano 003, D13): fuso validado só na entrada; na leitura, texto livre e sem canonizar. */
const ENTITY = { id: '7f3c2a1e-4b5d-4c6e-8f90-a1b2c3d4e5f6', createdAt: '2026-11-05T12:00:00.000Z' };
const preferences = (timeZone: string) => ({ locale: 'pt-BR', timeZone });
const group = (timeZone: string) => ({
  ...ENTITY,
  name: 'Vôlei de sexta',
  sport: 'volleyball',
  weekday: 5,
  time: '19:00',
  timeZone,
  slots: 12,
  listOpensHoursBefore: 48,
  reservesOpenHoursBefore: 24,
  maxMembers: 30,
  maxReserves: 30,
  ownerId: '7K3QX9TA',
  myRole: 'member',
  myPermissions: [],
});
const createGroup = (timeZone: string) => ({
  name: 'Vôlei de sexta',
  sport: 'volleyball',
  weekday: 5,
  time: '19:00',
  timeZone,
  slots: 12,
  listOpensHoursBefore: 48,
});

describe('contrato: fuso na leitura e na entrada (caso 14)', () => {
  it("caso 14: PreferencesSchema aceita 'Mars/Olympus' e devolve o texto igual", () => {
    expect(PreferencesSchema.parse(preferences('Mars/Olympus')).timeZone).toBe('Mars/Olympus');
  });

  it("caso 14: PreferencesSchema com 'Brazil/East' devolve igual (sem canonizar)", () => {
    expect(PreferencesSchema.parse(preferences('Brazil/East')).timeZone).toBe('Brazil/East');
  });

  it("caso 14: GroupSchema aceita 'Mars/Olympus' e devolve o texto igual", () => {
    expect(GroupSchema.parse(group('Mars/Olympus')).timeZone).toBe('Mars/Olympus');
  });

  it("caso 14: GroupSchema com 'Brazil/East' devolve igual (sem canonizar)", () => {
    expect(GroupSchema.parse(group('Brazil/East')).timeZone).toBe('Brazil/East');
  });

  it("caso 14: UpdateMeInputSchema com 'Mars/Olympus' → erro em timeZone", () => {
    const result = UpdateMeInputSchema.safeParse({ timeZone: 'Mars/Olympus' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['timeZone']);
  });

  it("caso 14: CreateGroupInputSchema com 'Mars/Olympus' → erro em timeZone", () => {
    const result = CreateGroupInputSchema.safeParse(createGroup('Mars/Olympus'));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['timeZone']);
  });

  it('caso 14: CreateGroupInputSchema com fuso válido passa (e canoniza na entrada)', () => {
    expect(CreateGroupInputSchema.parse(createGroup('Brazil/East')).timeZone).toBe('America/Sao_Paulo');
  });
});
