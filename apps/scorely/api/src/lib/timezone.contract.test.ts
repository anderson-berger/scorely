import { PreferencesSchema, UpdateMeInputSchema } from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

/** Contrato (plano 003, D13): fuso validado só na entrada; na leitura, texto livre e sem canonizar. */
const preferences = (timeZone: string) => ({ locale: 'pt-BR', timeZone });

describe('contrato: fuso na leitura e na entrada (caso 14)', () => {
  it("caso 14: PreferencesSchema aceita 'Mars/Olympus' e devolve o texto igual", () => {
    expect(PreferencesSchema.parse(preferences('Mars/Olympus')).timeZone).toBe('Mars/Olympus');
  });

  it("caso 14: PreferencesSchema com 'Brazil/East' devolve igual (sem canonizar)", () => {
    expect(PreferencesSchema.parse(preferences('Brazil/East')).timeZone).toBe('Brazil/East');
  });

  it("caso 14: UpdateMeInputSchema com 'Mars/Olympus' → erro em timeZone", () => {
    const result = UpdateMeInputSchema.safeParse({
      version: 1,
      preferences: { timeZone: 'Mars/Olympus' },
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['preferences', 'timeZone']);
  });
});
