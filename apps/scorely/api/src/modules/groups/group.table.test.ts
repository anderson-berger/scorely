import { asGroupId, asUserId } from '@scorely/api/src/lib/ids';
import * as table from '@scorely/api/src/modules/groups/group.table';
import {
  emailGroupInvitesLookupKey,
  groupCountersKey,
  groupInviteTokenLookupKey,
  userGroupInvitesLookupKey,
  userGroupsLookupKey,
} from '@scorely/api/src/modules/groups/group.table';
import { describe, expect, it } from 'vitest';

// As chaves de lookup no padrão LOOKUP#<de quem>#<o quê>#<valor> (dynamodb.md) e o contador do grupo (GRV-54).

const GID = asGroupId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
const UID = asUserId('11111111-1111-4111-8111-111111111111');

describe('group.table: chaves', () => {
  it('GRV-05: grupos da pessoa → LOOKUP#USER#GROUPS#<userId>, SK = groupId', () => {
    expect(userGroupsLookupKey(UID, GID)).toEqual({ PK: `LOOKUP#USER#GROUPS#${UID}`, SK: GID });
  });

  it('GRV-24: convites para a pessoa → LOOKUP#USER#GROUPINVITES#<userId>, SK = inviteId', () => {
    expect(userGroupInvitesLookupKey(UID, 'inv-1')).toEqual({
      PK: `LOOKUP#USER#GROUPINVITES#${UID}`,
      SK: 'inv-1',
    });
  });

  it('GRV-24: convites para o email → LOOKUP#EMAIL#GROUPINVITES#<email>, SK = inviteId', () => {
    expect(emailGroupInvitesLookupKey('a@b.com', 'inv-1')).toEqual({
      PK: 'LOOKUP#EMAIL#GROUPINVITES#a@b.com',
      SK: 'inv-1',
    });
  });

  it('GRV-18: o token continua em LOOKUP#GROUP#INVITE#<token>', () => {
    expect(groupInviteTokenLookupKey('tok')).toEqual({ PK: 'LOOKUP#GROUP#INVITE#tok', SK: 'META' });
  });

  it('GRV-54: o contador mora em GROUP#<id> / COUNTERS', () => {
    expect(groupCountersKey(GID)).toEqual({ PK: `GROUP#${GID}`, SK: 'COUNTERS' });
  });

  it('GRV-24: o lookup LOOKUP#GROUPINVITEID# saiu', () => {
    expect(table).not.toHaveProperty('groupInviteIdLookupKey');
  });
});
