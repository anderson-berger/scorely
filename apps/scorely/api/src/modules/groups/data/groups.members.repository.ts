import { stripKeys, transactWrite } from '@scorely/api/src/lib/db';
import { tableName } from '@scorely/api/src/lib/dynamo';
import type { GroupId, UserId } from '@scorely/api/src/lib/ids';
import {
  getItem,
  participantsDelta,
  queryByPrefix,
} from '@scorely/api/src/modules/groups/data/groups.dynamo';
import {
  GROUP_MEMBER_PREFIX,
  groupCountersKey,
  groupMemberKey,
  userGroupsLookupKey,
} from '@scorely/api/src/modules/groups/data/groups.table';
import type { StoredMembership } from '@scorely/api/src/modules/groups/data/groups.types';

export interface MemberRepository {
  /** Todas as participações do grupo (GRV-29). */
  listMembers(groupId: GroupId): Promise<StoredMembership[]>;
  /** Número de participantes (GRV-21, 54): o contador `COUNTERS`, num GetItem. */
  countParticipants(groupId: GroupId): Promise<number>;
  /**
   * Apaga a participação e o lookup do usuário e desconta 1 dos participantes (GRV-30, 31, 54). `false` = a pessoa já
   * não participava.
   */
  removeMembership(groupId: GroupId, userId: UserId): Promise<boolean>;
}

export const dynamoMemberRepository: MemberRepository = {
  async listMembers(groupId) {
    const rows = await queryByPrefix(groupId, GROUP_MEMBER_PREFIX);
    return rows.map((row) => stripKeys<StoredMembership>(row));
  },

  async countParticipants(groupId) {
    const item = await getItem(groupCountersKey(groupId));
    return (item?.participants as number | undefined) ?? 0;
  },

  async removeMembership(groupId, userId) {
    const result = await transactWrite([
      {
        Delete: {
          TableName: tableName(),
          Key: groupMemberKey(groupId, userId),
          ConditionExpression: 'attribute_exists(PK)',
        },
      },
      { Delete: { TableName: tableName(), Key: userGroupsLookupKey(userId, groupId) } },
      participantsDelta(groupId, -1, new Date().toISOString()),
    ]);
    return result.ok;
  },
};
