import { PublicUserIdSchema, type TeamApartRule, type TeamRule, type TeamSettings } from '@scorely/contracts';
import { i18n } from '@scorely/web/src/i18n/index';
import type { Text } from '@scorely/web/src/modules/teams/rules';
import { teamApartSummary, teamCountSummary, teamRulesSummary } from '@scorely/web/src/modules/teams/teams';
import { describe, expect, it } from 'vitest';

// TIM-21: os resumos das 3 linhas de times dos Ajustes (Times, Regras dos times, Times opostos). O teste confere o
// texto em pt-BR; as partes de um resumo se juntam com " · ".

const ANA = PublicUserIdSchema.parse('ANA00001');
const BIA = PublicUserIdSchema.parse('B1A00002');
const CAI = PublicUserIdSchema.parse('CA100003');

const setter: TeamRule = { target: { kind: 'position', position: 'setter' }, min: 1, max: 1 };
const women: TeamRule = { target: { kind: 'gender', gender: 'F' }, min: 2 };
const libero: TeamRule = { target: { kind: 'position', position: 'libero' }, max: 1 };
const anaBia: TeamApartRule = { people: [ANA, BIA] };
const anaCai: TeamApartRule = { people: [ANA, CAI] };

const base: TeamSettings = {
  teamCount: 2,
  rules: [],
  apart: [],
  spreadGender: false,
  allowOutsideRules: false,
  names: { [ANA]: 'Ana', [BIA]: 'Bia', [CAI]: 'Cai' },
};

function render(parts: Text | Text[]): string {
  i18n.global.locale.value = 'pt-BR';
  return [parts]
    .flat()
    .map((p: Text) => i18n.global.t(p.key, p.params ?? {}))
    .join(' · ');
}

describe('Ajustes › linha Times: resumo', () => {
  it('TIM-21: só a quantidade → "2 times"', () => {
    expect(render(teamCountSummary(base))).toBe('2 times');
  });

  it('TIM-21: a quantidade é a padrão do grupo', () => {
    expect(render(teamCountSummary({ ...base, teamCount: 4 }))).toBe('4 times');
  });

  it('TIM-21: espalhar ligado → "· espalha homens e mulheres"', () => {
    expect(render(teamCountSummary({ ...base, teamCount: 3, spreadGender: true }))).toBe(
      '3 times · espalha homens e mulheres',
    );
  });

  it('TIM-21: permitir fora das regras ligado → "· publica fora das regras"', () => {
    expect(render(teamCountSummary({ ...base, allowOutsideRules: true }))).toBe(
      '2 times · publica fora das regras',
    );
  });

  it('TIM-21: os dois ligados → os dois aparecem', () => {
    expect(render(teamCountSummary({ ...base, spreadGender: true, allowOutsideRules: true }))).toBe(
      '2 times · espalha homens e mulheres · publica fora das regras',
    );
  });

  it('TIM-21: as regras não entram no resumo da linha Times', () => {
    expect(render(teamCountSummary({ ...base, rules: [setter], apart: [anaBia] }))).toBe('2 times');
  });
});

describe('Ajustes › linha Regras dos times: resumo', () => {
  it('TIM-21: 3 regras → "3 regras"', () => {
    expect(render(teamRulesSummary({ ...base, rules: [setter, women, libero] }))).toBe('3 regras');
  });

  it('TIM-21: uma regra → "1 regra"', () => {
    expect(render(teamRulesSummary({ ...base, rules: [setter] }))).toBe('1 regra');
  });

  it('TIM-21: nenhuma → "Sem regras"', () => {
    expect(render(teamRulesSummary(base))).toBe('Sem regras');
  });

  it('TIM-21: times opostos não contam nas regras dos times', () => {
    expect(render(teamRulesSummary({ ...base, rules: [setter], apart: [anaBia, anaCai] }))).toBe('1 regra');
  });
});

describe('Ajustes › linha Times opostos: resumo', () => {
  it('TIM-21: 2 regras → "2 regras"', () => {
    expect(render(teamApartSummary({ ...base, apart: [anaBia, anaCai] }))).toBe('2 regras');
  });

  it('TIM-21: uma regra → "1 regra"', () => {
    expect(render(teamApartSummary({ ...base, apart: [anaBia] }))).toBe('1 regra');
  });

  it('TIM-21: nenhuma → "Nenhuma"', () => {
    expect(render(teamApartSummary(base))).toBe('Nenhuma');
  });

  it('TIM-21: as regras de quantidade não contam nos times opostos', () => {
    expect(render(teamApartSummary({ ...base, rules: [setter, women] }))).toBe('Nenhuma');
  });
});
