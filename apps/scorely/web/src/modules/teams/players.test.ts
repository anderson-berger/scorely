import type { Sport } from '@scorely/contracts';
import { makeMain, sportPositions, togglePosition } from '@scorely/web/src/modules/teams/players';
import { describe, expect, it } from 'vitest';

const VOLLEYBALL: Sport = {
  id: 'volleyball',
  name: { 'pt-BR': 'Vôlei', en: 'Volleyball' },
  active: true,
  positions: [
    { id: 'setter', name: { 'pt-BR': 'Levantador', en: 'Setter' }, active: true },
    { id: 'wing', name: { 'pt-BR': 'Ala', en: 'Wing' }, active: false },
    { id: 'middle', name: { 'pt-BR': 'Central', en: 'Middle' }, active: true },
    { id: 'libero', name: { 'pt-BR': 'Líbero', en: 'Libero' }, active: true },
  ],
};

describe('posições do esporte', () => {
  it('TIM-02: o painel mostra as posições ativas do esporte do grupo, na ordem do catálogo (ESP-05, ESP-06)', () => {
    expect(sportPositions(VOLLEYBALL)).toEqual(['setter', 'middle', 'libero']);
  });

  it('TIM-05: esporte sem posições (ou ainda sem catálogo) não tem nada para mostrar', () => {
    expect(sportPositions({ ...VOLLEYBALL, id: 'footvolley', positions: [] })).toEqual([]);
    expect(sportPositions(undefined)).toEqual([]);
  });
});

describe('marcar e desmarcar', () => {
  it('TIM-05: a primeira marcada já vem como principal', () => {
    expect(togglePosition([], 'middle', true)).toEqual(['middle']);
  });

  it('TIM-02: marcar outra não troca a principal (a nova vai depois)', () => {
    const next = togglePosition(['middle'], 'outside', true);
    expect(next[0]).toBe('middle');
    expect(next).toEqual(['middle', 'outside']);
  });

  it('TIM-02: desmarcar a principal faz a próxima marcada virar a principal', () => {
    expect(togglePosition(['middle', 'outside', 'libero'], 'middle', false)).toEqual(['outside', 'libero']);
  });

  it('TIM-02: desmarcar a última deixa a pessoa sem posição', () => {
    expect(togglePosition(['setter'], 'setter', false)).toEqual([]);
  });

  it('TIM-02: marcar de novo uma posição já marcada não repete', () => {
    expect(togglePosition(['setter'], 'setter', true)).toEqual(['setter']);
  });
});

describe('estrela', () => {
  it('TIM-05: a estrela torna a posição a principal (vai para a frente)', () => {
    const next = makeMain(['middle', 'outside', 'libero'], 'libero');
    expect(next[0]).toBe('libero');
    expect([...next].sort()).toEqual(['libero', 'middle', 'outside']);
  });

  it('TIM-05: a estrela na principal não muda nada', () => {
    expect(makeMain(['middle', 'outside'], 'middle')).toEqual(['middle', 'outside']);
  });
});
