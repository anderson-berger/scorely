// Como a competição é salva e buscada: na partição do grupo (ADR 0014; docs/modules/competicao.md, seção 3).
import type { GroupId } from '@scorely/api/src/lib/ids';

export const COMPETITION_ENTITY = 'Competition';
export const COMPETITION_FINAL_ENTITY = 'CompetitionFinal';

/** Prefixo das competições do grupo: Query `begins_with(SK, "COMPETITION#")`. */
export const COMPETITION_PREFIX = 'COMPETITION#';

const pk = (groupId: GroupId) => `GROUP#${groupId}`;

/** Competição (COM-01): `GROUP#<g> / COMPETITION#<competitionId>`. Entidade (`newEntity`). */
export function competitionKey(groupId: GroupId, competitionId: string) {
  return { PK: pk(groupId), SK: `${COMPETITION_PREFIX}${competitionId}` };
}

/** O último N do nome padrão (COM-02): `GROUP#<g> / COMPETITIONSEQ`, `{ last }`. Contador. */
export function competitionSeqKey(groupId: GroupId) {
  return { PK: pk(groupId), SK: 'COMPETITIONSEQ' };
}

/** O ranking final (COM-11): `GROUP#<g> / COMPETITIONFINAL#<competitionId>`. Gravado uma vez. */
export function competitionFinalKey(groupId: GroupId, competitionId: string) {
  return { PK: pk(groupId), SK: `COMPETITIONFINAL#${competitionId}` };
}

/** A partição da agenda da trava (COM-11): o dia (UTC) do fim do prazo, `COMPETITIONLOCK#<AAAA-MM-DD>`. */
export function competitionLockPk(instant: string) {
  return `COMPETITIONLOCK#${instant.slice(0, 10)}`;
}

/** Item da agenda da trava: `COMPETITIONLOCK#<dia> / <instante>#<g>#<competitionId>`. Ponteiro (`LOOKUP_ENTITY`). */
export function competitionLockKey(instant: string, groupId: GroupId, competitionId: string) {
  return { PK: competitionLockPk(instant), SK: `${instant}#${groupId}#${competitionId}` };
}
