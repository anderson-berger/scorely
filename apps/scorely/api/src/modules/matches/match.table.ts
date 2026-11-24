// Como a partida é salva e buscada: tudo na partição do grupo (ADR 0014; docs/modules/partidas.md, seção 3).
import type { GroupId, UserId } from '@scorely/api/src/lib/ids';

export const MATCH_ENTITY = 'Match';
export const MATCH_ATTENDANCE_ENTITY = 'MatchAttendance';
export const MATCH_GUEST_ENTITY = 'MatchGuest';

/** Prefixo das partidas do grupo: Query `begins_with(SK, "MATCH#")`. */
export const MATCH_PREFIX = 'MATCH#';

const pk = (groupId: GroupId) => `GROUP#${groupId}`;

/** Partida: `GROUP#<g> / MATCH#<matchId>`. Entidade (`newEntity`). */
export function matchKey(groupId: GroupId, matchId: string) {
  return { PK: pk(groupId), SK: `${MATCH_PREFIX}${matchId}` };
}

/** Prefixo das respostas da partida: `MATCHATT#<matchId>#`. */
export function matchAttendancePrefix(matchId: string) {
  return `MATCHATT#${matchId}#`;
}

/** Resposta (PAR-08): `GROUP#<g> / MATCHATT#<matchId>#<userId>`. Entidade de relação (ADR 0009). */
export function matchAttendanceKey(groupId: GroupId, matchId: string, userId: UserId) {
  return { PK: pk(groupId), SK: `${matchAttendancePrefix(matchId)}${userId}` };
}

/** Prefixo dos convidados da partida: `MATCHGUEST#<matchId>#`. */
export function matchGuestPrefix(matchId: string) {
  return `MATCHGUEST#${matchId}#`;
}

/** Convidado (PAR-11): `GROUP#<g> / MATCHGUEST#<matchId>#<guestId>`. Entidade (`newEntity`). */
export function matchGuestKey(groupId: GroupId, matchId: string, guestId: string) {
  return { PK: pk(groupId), SK: `${matchGuestPrefix(matchId)}${guestId}` };
}

/** Contador dos convidados ativos (PAR-12): `GROUP#<g> / MATCHGUESTS#<matchId>`, `{ active }`. */
export function matchGuestsCounterKey(groupId: GroupId, matchId: string) {
  return { PK: pk(groupId), SK: `MATCHGUESTS#${matchId}` };
}

/** Nome do convidado ativo (PAR-12): `GROUP#<g> / MATCHGUESTNAME#<matchId>#<nome normalizado>`, `{ id }`. */
export function matchGuestNameKey(groupId: GroupId, matchId: string, normalizedName: string) {
  return { PK: pk(groupId), SK: `MATCHGUESTNAME#${matchId}#${normalizedName}` };
}

export const MATCH_SERIES_ENTITY = 'MatchSeries';
export const ROUTINE_ENTITY = 'Routine';

/** Prefixo das repetições do grupo: Query `begins_with(SK, "MATCHSERIES#")`. */
export const MATCH_SERIES_PREFIX = 'MATCHSERIES#';

/** Repetição (PAR-20): `GROUP#<g> / MATCHSERIES#<seriesId>`. Entidade (`newEntity`). */
export function matchSeriesKey(groupId: GroupId, seriesId: string) {
  return { PK: pk(groupId), SK: `${MATCH_SERIES_PREFIX}${seriesId}` };
}

/** A partição da agenda (PAR-21, 24): a hora em UTC, `MATCHAGENDA#<AAAA-MM-DDTHH>`. */
export function matchAgendaPk(instant: string) {
  return `MATCHAGENDA#${instant.slice(0, 13)}`;
}

/** Item da agenda: `MATCHAGENDA#<hora> / <instante>#<g>#<matchId>`. Ponteiro (`LOOKUP_ENTITY`), não entidade. */
export function matchAgendaKey(instant: string, groupId: GroupId, matchId: string) {
  return { PK: matchAgendaPk(instant), SK: `${instant}#${groupId}#${matchId}` };
}

/** Até onde a rotina `matchesAgenda` já leu: `ROUTINE#MATCHAGENDA / META`. */
export const MATCH_AGENDA_CURSOR_KEY = { PK: 'ROUTINE#MATCHAGENDA', SK: 'META' };

export const MATCH_TEAMS_ENTITY = 'MatchTeams';

/** Os times da partida (PAR-25): `GROUP#<g> / MATCHTEAMS#<matchId>`. Chave natural pela partida (ADR 0009). */
export function matchTeamsKey(groupId: GroupId, matchId: string) {
  return { PK: pk(groupId), SK: `MATCHTEAMS#${matchId}` };
}
