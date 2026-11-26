import { groupRailItems } from '@scorely/web/src/layouts/rail';
import { groupColor, initials } from '@scorely/web/src/modules/groups/group-display';
import { describe, expect, it } from 'vitest';

const groups = [
  { id: 'K3X9PQ2A', name: 'Amigos do Vôlei', logoUrl: 'https://cdn.test/a.webp' },
  { id: 'H7MN4RTW', name: 'Pelada de Quinta', logoUrl: undefined },
  { id: 'B2C3D4E5', name: 'Racha', logoUrl: undefined },
];

describe('GRV-13: itens do trilho', () => {
  it('GRV-13: mantém a ordem recebida (a de GRV-05) e um item por grupo', () => {
    const items = groupRailItems(groups, undefined);
    expect(items.map((i) => i.id)).toEqual(['K3X9PQ2A', 'H7MN4RTW', 'B2C3D4E5']);
    expect(items.map((i) => i.name)).toEqual(['Amigos do Vôlei', 'Pelada de Quinta', 'Racha']);
  });

  it('GRV-13: só o grupo aberto fica destacado', () => {
    const items = groupRailItems(groups, 'H7MN4RTW');
    expect(items.map((i) => i.active)).toEqual([false, true, false]);
  });

  it('GRV-13: fora de um grupo (sem openId) nenhum fica destacado', () => {
    expect(groupRailItems(groups, undefined).some((i) => i.active)).toBe(false);
  });

  it('GRV-13: id aberto que não está na lista não destaca ninguém', () => {
    expect(groupRailItems(groups, 'ZZZZZZZZ').some((i) => i.active)).toBe(false);
  });

  it('GRV-13: o logo vem da resposta e some quando o grupo não tem', () => {
    const items = groupRailItems(groups, undefined);
    expect(items[0]?.logoUrl).toBe('https://cdn.test/a.webp');
    expect(items[1]?.logoUrl).toBeUndefined();
  });

  it('GRV-11: cor e iniciais saem do id público e do nome', () => {
    const items = groupRailItems(groups, undefined);
    expect(items[1]?.color).toBe(groupColor('H7MN4RTW'));
    expect(items[1]?.initials).toBe(initials('Pelada de Quinta'));
    expect(items[2]?.initials).toBe('R');
  });

  it('GRV-13: sem grupos, o trilho não tem itens de grupo', () => {
    expect(groupRailItems([], 'K3X9PQ2A')).toEqual([]);
  });
});
