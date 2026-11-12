import type {
  Gender,
  PlayerPosition,
  TeamApartRule,
  TeamRule,
  TeamRuleConflict,
  TeamViolation,
} from '@scorely/contracts';

/** O que as regras olham de uma pessoa (TIM-18): a principal no jogo e o gênero do perfil. */
export interface RulePerson {
  position?: PlayerPosition;
  gender?: Gender;
}

/**
 * Quem conta para as regras, por id. Quem não está aqui (saiu da lista, TIM-12) não conta.
 * Quem está aqui sem gênero não conta para regra de gênero.
 */
export type RulePeople = ReadonlyMap<string, RulePerson>;

/** TIM-18: a pessoa conta para o alvo da regra. */
export function matches(rule: TeamRule, person: RulePerson | undefined): boolean {
  if (!person) return false;
  return rule.target.kind === 'position'
    ? person.position === rule.target.position
    : person.gender === rule.target.gender;
}

/** Quantos do time contam para a regra. */
export function countIn(team: readonly string[], rule: TeamRule, people: RulePeople): number {
  return team.filter((id) => matches(rule, people.get(id))).length;
}

/** TIM-22: quem da regra de times opostos está em `team` e conta (está em `people`). */
export function apartIn(team: readonly string[], rule: TeamApartRule, people: RulePeople): string[] {
  return team.filter((id) => people.has(id) && rule.people.includes(id));
}

/**
 * TIM-20: cada time fora de cada regra (abaixo do mínimo ou acima do máximo) e, nos times opostos (TIM-22), cada
 * time com 2 ou mais da mesma regra.
 */
export function violations(
  teams: readonly string[][],
  rules: readonly TeamRule[],
  people: RulePeople,
  apart: readonly TeamApartRule[] = [],
): TeamViolation[] {
  const together = teams.flatMap((team, i) =>
    apart.flatMap((rule): TeamViolation[] => {
      const ids = apartIn(team, rule, people);
      return ids.length >= 2 ? [{ kind: 'apart', team: i + 1, people: ids }] : [];
    }),
  );
  return [...counted(teams, rules, people), ...together];
}

function counted(
  teams: readonly string[][],
  rules: readonly TeamRule[],
  people: RulePeople,
): TeamViolation[] {
  return teams.flatMap((team, i) =>
    rules.flatMap((rule) => {
      const count = countIn(team, rule, people);
      const outside =
        (rule.min !== undefined && count < rule.min) || (rule.max !== undefined && count > rule.max);
      return outside ? [{ kind: 'count' as const, team: i + 1, rule, count }] : [];
    }),
  );
}

/**
 * TIM-19: o que dá para saber antes de sortear. `start` são os times só com os fixados; `pool`, quem será sorteado.
 * Falta gente, sobra gente e fixados acima do máximo; nos times opostos (TIM-22), mais gente no sorteio que times e
 * fixados juntos. "Não fecham juntas" só o sorteio descobre.
 */
export function precheck(
  start: readonly string[][],
  pool: readonly string[],
  rules: readonly TeamRule[],
  people: RulePeople,
  apart: readonly TeamApartRule[] = [],
): TeamRuleConflict[] {
  return [...countConflicts(start, pool, rules, people), ...apartConflicts(start, pool, apart, people)];
}

function apartConflicts(
  start: readonly string[][],
  pool: readonly string[],
  apart: readonly TeamApartRule[],
  people: RulePeople,
): TeamRuleConflict[] {
  const everyone = [...new Set([...start.flat(), ...pool])];
  const tooMany = apart.flatMap((rule): TeamRuleConflict[] => {
    const inDraw = apartIn(everyone, rule, people);
    return inDraw.length > start.length
      ? [{ reason: 'apart_too_many', people: inDraw, teams: start.length }]
      : [];
  });
  const pinned = start.flatMap((team, i) =>
    apart.flatMap((rule): TeamRuleConflict[] => {
      const ids = apartIn(team, rule, people);
      return ids.length >= 2 ? [{ reason: 'apart_pinned', people: ids, team: i + 1 }] : [];
    }),
  );
  return [...tooMany, ...pinned];
}

function countConflicts(
  start: readonly string[][],
  pool: readonly string[],
  rules: readonly TeamRule[],
  people: RulePeople,
): TeamRuleConflict[] {
  const everyone = [...start.flat(), ...pool];
  const teams = start.length;
  const totals = rules.flatMap((rule): TeamRuleConflict[] => {
    const available = countIn(everyone, rule, people);
    const notEnough: TeamRuleConflict[] =
      rule.min !== undefined && available < rule.min * teams
        ? [{ reason: 'not_enough', rule, needed: rule.min * teams, available }]
        : [];
    const tooMany: TeamRuleConflict[] =
      rule.max !== undefined && available > rule.max * teams
        ? [{ reason: 'too_many', rule, capacity: rule.max * teams, available }]
        : [];
    return [...notEnough, ...tooMany];
  });
  const pinned = start.flatMap((team, i) =>
    rules.flatMap((rule): TeamRuleConflict[] => {
      const count = countIn(team, rule, people);
      return rule.max !== undefined && count > rule.max
        ? [{ reason: 'pinned', rule, team: i + 1, count }]
        : [];
    }),
  );
  return [...totals, ...pinned];
}
