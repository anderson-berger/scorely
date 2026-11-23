import { MATCH_DURATION, MATCH_LIMITS, type Match, type UpdateMatchInput } from '@scorely/contracts';

// PAR-06, 18: as configurações da partida. Cada painel muda só a sua parte e manda o resto como está.

const MINUTE_MS = 60_000;

/** As configurações como o `PUT` recebe, da partida mostrada (com a `version` dela, ADR 0016). */
export function settingsOf(match: Match): UpdateMatchInput {
  return {
    startsAt: match.startsAt,
    endsAt: match.endsAt,
    ...(match.teams !== undefined && { teams: match.teams }),
    ...(match.playersPerTeam !== undefined && { playersPerTeam: match.playersPerTeam }),
    ...(match.membersHours !== undefined && { membersHours: match.membersHours }),
    ...(match.reservesHours !== undefined && { reservesHours: match.reservesHours }),
    ...(match.guestsHours !== undefined && { guestsHours: match.guestsHours }),
    noGuests: match.noGuests,
    closeHours: match.closeHours,
    expectedVersion: match.version,
  };
}

/** O `PUT` com a parte mudada. `undefined` num opcional (o formato, uma hora da abertura) tira o campo. */
export function withSettings(
  match: Match,
  patch: Partial<Omit<UpdateMatchInput, 'expectedVersion'>>,
): UpdateMatchInput {
  const merged: Record<string, unknown> = { ...settingsOf(match), ...patch };
  for (const key of Object.keys(merged)) {
    if (merged[key] === undefined) delete merged[key];
  }
  return merged as UpdateMatchInput;
}

/** A duração em minutos (PAR-01: a diferença entre o fim e o início). */
export function durationOf(match: Pick<Match, 'startsAt' | 'endsAt'>): number {
  return Math.round((Date.parse(match.endsAt) - Date.parse(match.startsAt)) / MINUTE_MS);
}

/** O fim a partir do início e da duração. */
export function endFrom(startsAt: string, minutes: number): string {
  return new Date(Date.parse(startsAt) + minutes * MINUTE_MS).toISOString();
}

/** "2 h", "1 h 30", "45 min". */
export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

/** PAR-02: as vagas; sem formato, `undefined` (sem limite). */
export function slotsOf(match: Pick<Match, 'teams' | 'playersPerTeam'>): number | undefined {
  return match.teams !== undefined && match.playersPerTeam !== undefined
    ? match.teams * match.playersPerTeam
    : undefined;
}

const MAX_MINUTES = MATCH_LIMITS.durationMaxHours * 60;

/** PAR-17: a duração nos dois campos do painel, horas e minutos. */
export function splitDuration(minutes: number): { hours: number; minutes: number } {
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60 };
}

/** PAR-17: os dois campos de volta em minutos; fora de 1 min a 24 h (ou minutos fora de 0–59), `undefined`. */
export function joinDuration(hours: number, minutes: number): number | undefined {
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || minutes < 0 || minutes > 59) {
    return undefined;
  }
  const total = hours * 60 + minutes;
  return total >= MATCH_DURATION.minMinutes && total <= MAX_MINUTES ? total : undefined;
}
