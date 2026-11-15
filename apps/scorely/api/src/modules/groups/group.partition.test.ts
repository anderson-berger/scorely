import { competitionKey } from '@scorely/api/src/modules/competition/competition.table';
import { groupCountersKey, groupKey } from '@scorely/api/src/modules/groups/group.table';
import { teamSettingsKey } from '@scorely/api/src/modules/teams/settings.table';
import { describe, expect, it } from 'vitest';

// Partição do grupo (ADR 0014, 0015; docs/modules/grupos.md seção 3, times.md e competicao.md): tudo o que é do grupo
// mora em `GROUP#<id>`. O comportamento não muda; só a chave.

const GROUP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('itens do grupo na partição do grupo (ADR 0014)', () => {
  it('GRP-04: o grupo é o item META da partição do grupo, e a contagem, o COUNTERS', () => {
    expect(groupKey(GROUP_ID)).toEqual({ PK: `GROUP#${GROUP_ID}`, SK: 'META' });
    expect(groupCountersKey(GROUP_ID)).toEqual({ PK: `GROUP#${GROUP_ID}`, SK: 'COUNTERS' });
  });

  it('TIM-17: a configuração de times mora em GROUP#<id> / TEAM_SETTINGS', () => {
    expect(teamSettingsKey(GROUP_ID)).toEqual({ PK: `GROUP#${GROUP_ID}`, SK: 'TEAM_SETTINGS' });
  });

  it('CMP-01: a competição do grupo mora em GROUP#<id> / COMPETITION', () => {
    expect(competitionKey(GROUP_ID)).toEqual({ PK: `GROUP#${GROUP_ID}`, SK: 'COMPETITION' });
  });
});
