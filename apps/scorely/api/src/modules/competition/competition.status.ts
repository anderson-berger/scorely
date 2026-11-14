import type { StoredCompetition } from '@scorely/api/src/modules/competition/competition.repository';
import type { CompetitionStatus } from '@scorely/contracts';

/**
 * CMP-01: o estado sai da data, na leitura, num ponto só (a cobrança troca só quem grava `activeUntil`, CMP-03).
 * No instante exato de "ativa até" já é vencida: a mesma conta da gravação (`activeUntil > agora`).
 */
export function competitionStatus(item: StoredCompetition | undefined, now: Date): CompetitionStatus {
  if (!item) return 'inactive';
  return item.activeUntil > now.toISOString() ? 'active' : 'expired';
}
