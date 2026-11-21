import type { GroupV2 } from '@scorely/contracts/src/groups-v2';
import { groupV2NavItems } from '@scorely/web/src/modules/groups-v2/nav';
import { describe, expect, it } from 'vitest';

const group = (myRole: string): GroupV2 =>
  ({
    id: 'K3X9PQ2A',
    createdAt: '2026-11-20T10:00:00.000Z',
    version: 1,
    name: 'Pelada de sexta',
    myRole,
  }) as GroupV2;

describe('groupV2NavItems', () => {
  it('GRV-13: o dono vê Início e Configurações, nessa ordem, com as rotas de cada área', () => {
    const items = groupV2NavItems(group('owner'));
    expect(items.map((i) => i.key)).toEqual(['home', 'settings']);
    expect(items.map((i) => i.to.name)).toEqual(['group-v2', 'group-v2-settings']);
  });

  it('GRV-13: cada área tem ícone', () => {
    for (const item of groupV2NavItems(group('owner'))) {
      expect(item.icon).toBeTruthy();
    }
  });

  it('GRV-13, GRV-14: quem não é dono só vê Início (Configurações não aparece)', () => {
    const items = groupV2NavItems(group('member'));
    expect(items.map((i) => i.key)).toEqual(['home']);
  });

  it('GRV-13: com uma área só, a lista tem 1 item (a tela esconde a barra com menos de 2)', () => {
    expect(groupV2NavItems(group('member'))).toHaveLength(1);
  });
});
