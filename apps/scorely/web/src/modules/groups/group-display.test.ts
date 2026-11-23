import { groupColor, initials } from '@scorely/web/src/modules/groups/group-display';
import { describe, expect, it } from 'vitest';

describe('GRV-11: grupo sem imagem', () => {
  it('GRV-11: a cor é fixa para o mesmo id público', () => {
    expect(groupColor('K3X9PQ2A')).toBe(groupColor('K3X9PQ2A'));
  });

  it('GRV-11: a cor fica sempre entre 1 e 6', () => {
    const ids = ['K3X9PQ2A', 'AAAAAAAA', 'ZZZZZZZZ', '23456789', 'H7MN4RTW', 'B'];
    ids.forEach((id) => {
      const color = groupColor(id);
      expect(Number.isInteger(color)).toBe(true);
      expect(color).toBeGreaterThanOrEqual(1);
      expect(color).toBeLessThanOrEqual(6);
    });
  });

  it('GRV-11: ids diferentes espalham em mais de uma cor', () => {
    const ids = ['K3X9PQ2A', 'AAAAAAAA', 'ZZZZZZZZ', '23456789', 'H7MN4RTW', 'B2C3D4E5', 'QWERTY12'];
    expect(new Set(ids.map(groupColor)).size).toBeGreaterThan(1);
  });

  it('GRV-11: as iniciais são a primeira letra da primeira e da última palavra', () => {
    expect(initials('Pelada de Quinta')).toBe('PQ');
    expect(initials('Vôlei dos Amigos')).toBe('VA');
  });

  it('GRV-11: nome de uma palavra só dá uma inicial, em maiúscula', () => {
    expect(initials('racha')).toBe('R');
  });

  it('GRV-11: espaços sobrando não contam', () => {
    expect(initials('  ana   maria  ')).toBe('AM');
  });
});
