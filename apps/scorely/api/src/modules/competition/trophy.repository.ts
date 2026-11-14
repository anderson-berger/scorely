import { batchGetOrdered, queryLookupRows, stripKeys } from '@scorely/api/src/lib/db';
import { trophyKey, trophyLookupPk } from '@scorely/api/src/modules/competition/trophy.table';
import type { TrophyKind } from '@scorely/contracts';

/** O troféu como fica no banco (CMP-36), com o id do sistema. Gravado na transação do ranking final. */
export interface StoredTrophy {
  seasonId: string;
  userId: string;
  kind: TrophyKind;
  groupId: string;
  awardedAt: string;
}

export interface TrophyRepository {
  /** Os troféus da pessoa, de todos os grupos, pelo lookup (do mais antigo para o mais recente). */
  listByUser(userId: string): Promise<StoredTrophy[]>;
}

export const dynamoTrophyRepository: TrophyRepository = {
  async listByUser(userId) {
    const rows = await queryLookupRows(trophyLookupPk(userId));
    const items = await batchGetOrdered(rows.map((r) => trophyKey(r.id)));
    return items.map((row) => stripKeys<StoredTrophy>(row));
  },
};
