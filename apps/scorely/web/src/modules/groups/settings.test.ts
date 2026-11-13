import { i18n } from '@scorely/web/src/i18n/index';
import { capacitySummary, limitsSummary } from '@scorely/web/src/modules/groups/settings';
import type { Text } from '@scorely/web/src/modules/teams/rules';
import { describe, expect, it } from 'vitest';

// GRP-29: o resumo de cada linha dos Ajustes. Cada função devolve os pedaços (`Text`); o componente traduz e junta
// com " · ". O teste confere o texto em pt-BR, que é o que o doc define.

function summary(parts: Text[]): string {
  i18n.global.locale.value = 'pt-BR';
  return parts.map((p) => i18n.global.t(p.key, p.params ?? {})).join(' · ');
}

describe('Ajustes › Vagas e mínimo', () => {
  it('GRP-29: sem mínimo → "14 vagas · sem mínimo"', () => {
    expect(summary(capacitySummary({ slots: 14 }))).toBe('14 vagas · sem mínimo');
  });

  it('GRP-29: com mínimo → "14 vagas · mínimo 10"', () => {
    expect(summary(capacitySummary({ slots: 14, minPlayers: 10 }))).toBe('14 vagas · mínimo 10');
  });

  it('GRP-29: o resumo tem dois pedaços, as vagas e o mínimo', () => {
    expect(capacitySummary({ slots: 14 })).toHaveLength(2);
  });
});

describe('Ajustes › Limites', () => {
  it('GRP-29: "30 membros · 30 reservas"', () => {
    expect(summary(limitsSummary({ maxMembers: 30, maxReserves: 30 }))).toBe('30 membros · 30 reservas');
  });

  it('GRP-29: cada limite com o seu número', () => {
    expect(summary(limitsSummary({ maxMembers: 14, maxReserves: 5 }))).toBe('14 membros · 5 reservas');
  });
});
