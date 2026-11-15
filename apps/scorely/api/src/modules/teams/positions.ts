import type { SportService } from '@scorely/api/src/modules/sports/sport.service';

/**
 * TIM-02, ESP-05: quais posições valem no esporte do grupo. Uma posição ativa do catálogo sempre vale; uma
 * desativada só vale para quem já a tinha (`kept`: o que já estava gravado para aquela pessoa, regra ou avulso).
 * Posição que não é do esporte nunca vale.
 */
export async function positionsOf(sports: Pick<SportService, 'get'>, sportId: string) {
  const sport = await sports.get(sportId);
  const active = new Set((sport?.positions ?? []).filter((p) => p.active).map((p) => p.id));
  const known = new Set((sport?.positions ?? []).map((p) => p.id));
  return {
    /** A 1ª posição de `positions` que não vale, ou `undefined` se todas valem. */
    invalid(positions: readonly string[], kept: readonly string[] = []): string | undefined {
      const had = new Set(kept);
      return positions.find((p) => !active.has(p) && !(known.has(p) && had.has(p)));
    },
  };
}
