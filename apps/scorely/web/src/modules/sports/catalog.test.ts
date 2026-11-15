import type { Sport } from '@scorely/contracts';
import {
  activePositions,
  localized,
  pickerPositions,
  positionName,
} from '@scorely/web/src/modules/sports/catalog';
import { describe, expect, it } from 'vitest';

/** Vôlei com uma posição desativada no meio (`wing`), para provar a ordem do catálogo. */
const VOLLEYBALL: Sport = {
  id: 'volleyball',
  name: { 'pt-BR': 'Vôlei', en: 'Volleyball' },
  active: true,
  positions: [
    { id: 'setter', name: { 'pt-BR': 'Levantador', en: 'Setter' }, active: true },
    { id: 'wing', name: { 'pt-BR': 'Ala', en: 'Wing' }, active: false },
    { id: 'middle', name: { 'pt-BR': 'Central', en: 'Middle' }, active: true },
    { id: 'libero', name: { 'pt-BR': 'Líbero', en: 'Libero' }, active: true },
    { id: 'rover', name: { 'pt-BR': 'Coringa', en: 'Rover' }, active: false },
  ],
};

const NO_POSITIONS: Sport = {
  id: 'footvolley',
  name: { 'pt-BR': 'Futevôlei', en: 'Footvolley' },
  active: true,
  positions: [],
};

describe('nome no idioma da pessoa (ESP-08)', () => {
  it('ESP-08: mostra o nome no idioma da pessoa', () => {
    expect(localized(VOLLEYBALL.name, 'pt-BR')).toBe('Vôlei');
    expect(localized(VOLLEYBALL.name, 'en')).toBe('Volleyball');
  });

  it('ESP-08: idioma que o catálogo não tem cai no pt-BR', () => {
    expect(localized(VOLLEYBALL.name, 'es')).toBe('Vôlei');
  });
});

describe('posições do esporte (TIM-02, ESP-05, ESP-06)', () => {
  it('ESP-05: a desativada some da escolha; ESP-06: as ativas vêm na ordem do catálogo', () => {
    expect(activePositions(VOLLEYBALL)).toEqual(['setter', 'middle', 'libero']);
  });

  it('TIM-02: esporte sem posições, ou sem esporte, não tem posição para mostrar', () => {
    expect(activePositions(NO_POSITIONS)).toEqual([]);
    expect(activePositions(undefined)).toEqual([]);
  });

  it('TIM-02: quem já tem uma posição desativada continua vendo, na ordem do catálogo', () => {
    expect(pickerPositions(VOLLEYBALL, ['libero', 'wing'])).toEqual(['setter', 'wing', 'middle', 'libero']);
  });

  it('ESP-05: a desativada que a pessoa não tem não aparece no seletor', () => {
    expect(pickerPositions(VOLLEYBALL, [])).toEqual(['setter', 'middle', 'libero']);
    expect(pickerPositions(VOLLEYBALL, ['setter'])).toEqual(['setter', 'middle', 'libero']);
  });

  it('TIM-02: sem esporte, o seletor fica vazio', () => {
    expect(pickerPositions(undefined, ['setter'])).toEqual([]);
  });
});

describe('nome da posição (TIM-02, ESP-05, ESP-08)', () => {
  it('ESP-08: o nome da posição vem do catálogo, no idioma da pessoa (cai no pt-BR)', () => {
    expect(positionName(VOLLEYBALL, 'setter', 'pt-BR')).toBe('Levantador');
    expect(positionName(VOLLEYBALL, 'setter', 'en')).toBe('Setter');
    expect(positionName(VOLLEYBALL, 'setter', 'es')).toBe('Levantador');
  });

  it('ESP-05: a posição desativada continua com o nome para quem já a tem', () => {
    expect(positionName(VOLLEYBALL, 'wing', 'en')).toBe('Wing');
  });

  it('TIM-02: posição que o catálogo não conhece aparece pelo próprio id', () => {
    expect(positionName(VOLLEYBALL, 'pitcher', 'pt-BR')).toBe('pitcher');
    expect(positionName(undefined, 'setter', 'pt-BR')).toBe('setter');
  });
});
