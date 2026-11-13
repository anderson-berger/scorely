import type { TeamRule, TeamViolation } from '@scorely/contracts';
import { en } from '@scorely/web/src/i18n/locales/en';
import { ptBR } from '@scorely/web/src/i18n/locales/pt-BR';
import {
  availableTargets,
  conflictText,
  putRule,
  removeRule,
  ruleText,
  targetText,
  violationsOfTeam,
  violationText,
} from '@scorely/web/src/modules/teams/rules';
import { describe, expect, it } from 'vitest';

const SETTER: TeamRule = { target: { kind: 'position', position: 'setter' }, min: 1, max: 1 };
const WOMEN: TeamRule = { target: { kind: 'gender', gender: 'F' }, min: 2 };
const LIBERO: TeamRule = { target: { kind: 'position', position: 'libero' }, max: 1 };

/** A chave existe nos dois idiomas. */
function hasKey(key: string): boolean {
  const get = (root: unknown) =>
    key
      .split('.')
      .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], root);
  return typeof get(ptBR) === 'string' && typeof get(en) === 'string';
}

describe('textos das regras (TIM-19–21)', () => {
  it('TIM-21: a regra vira "1 por time", "no mínimo", "no máximo" ou "de X a Y"', () => {
    expect(ruleText(SETTER)).toEqual({ key: 'teams.rules.exact', params: { n: 1 } });
    expect(ruleText(WOMEN)).toEqual({ key: 'teams.rules.atLeast', params: { n: 2 } });
    expect(ruleText(LIBERO)).toEqual({ key: 'teams.rules.atMost', params: { n: 1 } });
    expect(ruleText({ ...SETTER, max: 2 })).toEqual({
      key: 'teams.rules.between',
      params: { min: 1, max: 2 },
    });
  });

  it('TIM-21: o alvo é a posição traduzida ou o gênero', () => {
    expect(targetText(SETTER.target)).toEqual({ key: 'teams.positions.setter' });
    expect(targetText(WOMEN.target)).toEqual({ key: 'teams.rules.gender.F' });
  });

  it('TIM-20: abaixo do mínimo é "falta N"; acima do máximo, "passou N"', () => {
    expect(violationText({ kind: 'count', team: 2, rule: SETTER, count: 0 })).toEqual({
      key: 'teams.rules.missing',
      params: { n: 1 },
    });
    expect(violationText({ kind: 'count', team: 1, rule: SETTER, count: 3 })).toEqual({
      key: 'teams.rules.over',
      params: { n: 2 },
    });
  });

  it('TIM-19: cada conflito tem o seu texto', () => {
    expect(conflictText({ reason: 'not_enough', rule: SETTER, needed: 3, available: 2 })).toEqual({
      key: 'teams.rules.notEnough',
      params: { needed: 3, available: 2 },
    });
    expect(conflictText({ reason: 'too_many', rule: LIBERO, capacity: 2, available: 3 })).toEqual({
      key: 'teams.rules.tooMany',
      params: { capacity: 2, available: 3 },
    });
    expect(conflictText({ reason: 'pinned', rule: SETTER, team: 1, count: 2 })).toEqual({
      key: 'teams.rules.pinnedOver',
      params: { team: 1, count: 2, max: 1 },
    });
    expect(conflictText({ reason: 'unsolvable' })).toEqual({ key: 'teams.rules.unsolvable' });
  });

  it('TIM-19–21: todas as chaves usadas existem em pt-BR e en', () => {
    const texts = [
      ruleText(SETTER),
      ruleText(WOMEN),
      ruleText(LIBERO),
      ruleText({ ...SETTER, max: 2 }),
      targetText(WOMEN.target),
      targetText({ kind: 'gender', gender: 'M' }),
      violationText({ kind: 'count', team: 2, rule: SETTER, count: 0 }),
      violationText({ kind: 'count', team: 1, rule: SETTER, count: 3 }),
      conflictText({ reason: 'not_enough', rule: SETTER, needed: 3, available: 2 }),
      conflictText({ reason: 'too_many', rule: LIBERO, capacity: 2, available: 3 }),
      conflictText({ reason: 'pinned', rule: SETTER, team: 1, count: 2 }),
      conflictText({ reason: 'unsolvable' }),
    ];
    for (const t of texts) expect(hasKey(t.key), t.key).toBe(true);
  });
});

describe('editar as regras (TIM-21)', () => {
  it('TIM-21: os alvos são as posições do esporte e os gêneros, sem os que já têm regra', () => {
    const all = availableTargets('volleyball', []);
    expect(all).toHaveLength(5 + 2);
    const rest = availableTargets('volleyball', [SETTER, WOMEN]);
    expect(rest).not.toContainEqual(SETTER.target);
    expect(rest).not.toContainEqual(WOMEN.target);
    expect(rest).toHaveLength(5);
  });

  it('TIM-21: ao editar uma regra, o alvo dela continua na lista', () => {
    expect(availableTargets('volleyball', [SETTER], SETTER.target)).toContainEqual(SETTER.target);
  });

  it('TIM-18: no esporte "outro" só há gênero', () => {
    expect(availableTargets('other', [])).toEqual([
      { kind: 'gender', gender: 'F' },
      { kind: 'gender', gender: 'M' },
    ]);
  });

  it('TIM-21: salvar troca a regra do mesmo alvo no lugar, ou acrescenta no fim; remover tira', () => {
    expect(putRule([SETTER, WOMEN], LIBERO)).toEqual([SETTER, WOMEN, LIBERO]);
    const libero = { ...LIBERO, target: { kind: 'position' as const, position: 'libero' as const } };
    expect(putRule([SETTER, WOMEN], libero, SETTER.target)).toEqual([libero, WOMEN]);
    expect(removeRule([SETTER, WOMEN], SETTER.target)).toEqual([WOMEN]);
  });

  it('TIM-20: as violações de um time', () => {
    const v: TeamViolation[] = [
      { kind: 'count', team: 1, rule: SETTER, count: 2 },
      { kind: 'count', team: 2, rule: SETTER, count: 0 },
    ];
    expect(violationsOfTeam(v, 2)).toEqual([{ kind: 'count', team: 2, rule: SETTER, count: 0 }]);
    expect(violationsOfTeam(undefined, 1)).toEqual([]);
  });
});
