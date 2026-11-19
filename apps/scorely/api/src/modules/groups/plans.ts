/**
 * O que cada plano do grupo permite. Ainda não há cobrança: todo grupo está no `free`. O número fica aqui, e não no
 * contrato, para mudar por plano sem mudar o web (ADR 0015). O web lê o limite do erro (`details.max`).
 */
export const SCHEDULE_LIMIT_BY_PLAN = {
  /** GRP-64: horários ativos por grupo. */
  free: 3,
} as const;
