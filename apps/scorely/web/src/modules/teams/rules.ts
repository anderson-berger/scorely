import {
  type Gender,
  type PlayerPosition,
  SPORT_POSITIONS,
  type Sport,
  type TeamRule,
  type TeamRuleConflict,
  type TeamRuleTarget,
  type TeamViolation,
  teamRuleKey,
} from '@scorely/contracts';

/** Uma chave de i18n com os parâmetros; o componente traduz com `$t(key, params)`. */
export interface Text {
  key: string;
  params?: Record<string, string | number>;
}

const GENDERS: Gender[] = ['F', 'M'];

/** Nome do alvo da regra (TIM-18): a posição ou "Homens"/"Mulheres". */
export function targetText(target: TeamRuleTarget): Text {
  return target.kind === 'position'
    ? { key: `teams.positions.${target.position}` }
    : { key: `teams.rules.gender.${target.gender}` };
}

/** "1 por time", "no mínimo 2 por time", "no máximo 1 por time", "de 1 a 2 por time" (TIM-21). */
export function ruleText(rule: TeamRule): Text {
  if (rule.min !== undefined && rule.max !== undefined) {
    return rule.min === rule.max
      ? { key: 'teams.rules.exact', params: { n: rule.min } }
      : { key: 'teams.rules.between', params: { min: rule.min, max: rule.max } };
  }
  if (rule.min !== undefined) return { key: 'teams.rules.atLeast', params: { n: rule.min } };
  return { key: 'teams.rules.atMost', params: { n: rule.max ?? 0 } };
}

/** "Ana", "Ana e Bia", "Ana, Bia e Carla" (`and` = a palavra traduzida). */
export function joinNames(names: readonly string[], and: string): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} ${and} ${names[names.length - 1]}`;
}

/** Os nomes das pessoas pelos ids, procurando em `people` (`unnamed` para quem não tem nome ou não está lá). */
export function namesIn(
  people: readonly { userId: string; name?: string | undefined }[],
  ids: readonly string[],
  unnamed: string,
): string[] {
  const byId = new Map(people.flatMap((p) => (p.name ? [[p.userId, p.name] as const] : [])));
  return ids.map((id) => byId.get(id) ?? unnamed);
}

/**
 * O que está fora (TIM-20): "falta 1" abaixo do mínimo, "passou 1" acima do máximo; nos times opostos (TIM-22),
 * "Ana e Bia deviam estar em times diferentes" (`names` já juntos, `joinNames`).
 */
export function violationText(v: TeamViolation, names = ''): Text {
  if (v.kind === 'apart') return { key: 'teams.rules.apartTogether', params: { names } };
  if (v.rule.min !== undefined && v.count < v.rule.min) {
    return { key: 'teams.rules.missing', params: { n: v.rule.min - v.count } };
  }
  return { key: 'teams.rules.over', params: { n: v.count - (v.rule.max ?? v.count) } };
}

/**
 * O que impede o sorteio (TIM-19). O alvo vai à parte (`targetText`), porque precisa de tradução; nos times opostos
 * (TIM-22), `names` são as pessoas já juntas (`joinNames`).
 */
export function conflictText(c: TeamRuleConflict, names = ''): Text {
  switch (c.reason) {
    case 'not_enough':
      return { key: 'teams.rules.notEnough', params: { needed: c.needed, available: c.available } };
    case 'too_many':
      return { key: 'teams.rules.tooMany', params: { capacity: c.capacity, available: c.available } };
    case 'pinned':
      return {
        key: 'teams.rules.pinnedOver',
        params: { team: c.team, count: c.count, max: c.rule.max ?? 0 },
      };
    case 'apart_too_many':
      return { key: 'teams.rules.apartTooMany', params: { names, needed: c.people.length, teams: c.teams } };
    case 'apart_pinned':
      return { key: 'teams.rules.apartPinned', params: { names, team: c.team } };
    case 'unsolvable':
      return { key: 'teams.rules.unsolvable' };
  }
}

/**
 * Os alvos que dá para escolher numa regra (TIM-21): as posições do esporte e os gêneros,
 * sem os que já têm regra (menos o da própria regra em edição).
 */
export function availableTargets(
  sport: Sport,
  rules: readonly TeamRule[],
  editing?: TeamRuleTarget,
): TeamRuleTarget[] {
  const taken = new Set(rules.map((r) => teamRuleKey(r.target)));
  if (editing) taken.delete(teamRuleKey(editing));
  const positions: TeamRuleTarget[] = (SPORT_POSITIONS[sport] as readonly PlayerPosition[]).map(
    (position) => ({
      kind: 'position',
      position,
    }),
  );
  const genders: TeamRuleTarget[] = GENDERS.map((gender) => ({ kind: 'gender', gender }));
  return [...positions, ...genders].filter((t) => !taken.has(teamRuleKey(t)));
}

/** Substitui a regra do mesmo alvo de `previous` (ou acrescenta), mantendo a ordem. */
export function putRule(rules: readonly TeamRule[], rule: TeamRule, previous?: TeamRuleTarget): TeamRule[] {
  if (!previous) return [...rules, rule];
  const key = teamRuleKey(previous);
  return rules.map((r) => (teamRuleKey(r.target) === key ? rule : r));
}

/** Tira a regra do alvo. */
export function removeRule(rules: readonly TeamRule[], target: TeamRuleTarget): TeamRule[] {
  const key = teamRuleKey(target);
  return rules.filter((r) => teamRuleKey(r.target) !== key);
}

/** As violações de um time (1 = Time 1). */
export function violationsOfTeam(
  violations: readonly TeamViolation[] | undefined,
  team: number,
): TeamViolation[] {
  return (violations ?? []).filter((v) => v.team === team);
}
