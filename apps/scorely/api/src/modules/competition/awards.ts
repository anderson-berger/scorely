import type { StoredFinal } from '@scorely/api/src/modules/competition/season.repository';
import type { TrophyKind } from '@scorely/contracts';

const PODIUM: Record<number, TrophyKind> = { 1: 'champion', 2: 'second', 3: 'third' };

/** CMP-36: os destaques: quem tem o máximo de presenças e da maior sequência (pelo menos 1), com os empates. */
export function highlightsOf(final: StoredFinal): { kind: 'attendance' | 'streak'; ids: string[] }[] {
  return (['attendance', 'streak'] as const).flatMap((kind) => {
    const best = Math.max(0, ...final.rows.map((r) => r[kind]));
    if (best < 1) return [];
    return [{ kind, ids: final.rows.filter((r) => r[kind] === best).map((r) => r.id) }];
  });
}

/**
 * CMP-36: os troféus da temporada travada: o pódio pelas posições 1 a 3 (com os empatados) e os destaques. Temporada
 * sem nenhum jogo fechado não entrega nada.
 */
export function trophiesOf(final: StoredFinal): { userId: string; kind: TrophyKind }[] {
  if (final.games === 0) return [];
  const podium = final.rows.flatMap((r) => {
    const kind = PODIUM[r.position];
    return kind ? [{ userId: r.id, kind }] : [];
  });
  const highlights = highlightsOf(final).flatMap((h) => h.ids.map((userId) => ({ userId, kind: h.kind })));
  return [...podium, ...highlights];
}
