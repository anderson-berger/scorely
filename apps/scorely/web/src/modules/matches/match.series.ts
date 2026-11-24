import type { Match, UpdateMatchSeriesInput } from '@scorely/contracts';
import { matchesApi } from '@scorely/web/src/modules/matches/matches.api';

/**
 * PAR-18, 22: "Também nas próximas semanas". A partida já foi salva (PAR-06); aqui vai o `PUT` da repetição, com a
 * `version` dela. Volta a partida com a repetição nova; se a repetição falhar, a partida salva e o erro, para a tela
 * mostrar os dois sem perder o que salvou.
 */
export async function saveSeries(
  groupId: string,
  match: Match,
  input: UpdateMatchSeriesInput,
): Promise<{ match: Match; error?: unknown }> {
  if (!match.series) return { match };
  try {
    const series = await matchesApi.updateSeries(groupId, match.series.id, input);
    return { match: { ...match, series } };
  } catch (error) {
    return { match, error };
  }
}
