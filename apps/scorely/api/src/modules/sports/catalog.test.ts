import { SPORT_CATALOG } from '@scorely/api/src/modules/sports/catalog';
import type { SportRepository, StoredSport } from '@scorely/api/src/modules/sports/sport.repository';
import { syncCatalog } from '@scorely/api/src/modules/sports/sync';
import { LocaleSchema, SportSchema } from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

// Esportes (`.claude/work/esportes.md`): o arquivo do catálogo (`catalog.ts`), ESP-02, 03, 04 e TIM-02.
// Começa com vôlei, futebol e basquete, com as posições e os nomes que estavam nos locales do web.

describe('arquivo do catálogo de esportes', () => {
  it('ESP-02 / ESP-03: cada esporte do arquivo passa no contrato (id legível, nome em todos os idiomas, posições também)', () => {
    expect(SPORT_CATALOG.length).toBeGreaterThan(0);
    for (const entry of SPORT_CATALOG) {
      const sport = {
        ...entry,
        active: true,
        positions: entry.positions.map((p) => ({ ...p, active: true })),
      };
      expect(SportSchema.safeParse(sport).success, entry.id).toBe(true);
      for (const locale of LocaleSchema.options) expect(entry.name[locale]?.trim(), entry.id).toBeTruthy();
    }
  });

  it('ESP-02: ids únicos de esporte, e de posição dentro de cada esporte', () => {
    const ids = SPORT_CATALOG.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of SPORT_CATALOG) {
      const positions = entry.positions.map((p) => p.id);
      expect(new Set(positions).size, entry.id).toBe(positions.length);
    }
  });

  it('ESP-04: não existe o esporte "outro"', () => {
    expect(SPORT_CATALOG.map((s) => s.id)).not.toContain('other');
  });

  it('ESP-03: o sync aceita o arquivo do repositório', async () => {
    const saved: StoredSport[] = [];
    const repo: SportRepository = {
      list: async () => [],
      get: async () => undefined,
      save: async (sport) => {
        saved.push(sport);
      },
    };
    await syncCatalog(repo, SPORT_CATALOG);
    expect(saved.map((s) => s.id)).toEqual(SPORT_CATALOG.map((s) => s.id));
  });

  it('TIM-02: vôlei, futebol e basquete, nessa ordem, com todas as posições do esporte na ordem de exibição', () => {
    const shape = SPORT_CATALOG.map((s) => [s.id, s.positions.map((p) => p.id)]);
    expect(shape.slice(0, 3)).toEqual([
      ['volleyball', ['setter', 'opposite', 'outside', 'middle', 'libero']],
      ['soccer', ['goalkeeper', 'defender', 'fullback', 'defensive_mid', 'midfielder', 'forward']],
      ['basketball', ['guard', 'wing', 'center']],
    ]);
  });

  it('TIM-02: os nomes do esporte e das posições são os que o web mostrava (pt-BR e en)', () => {
    const byId = new Map(SPORT_CATALOG.map((s) => [s.id, s]));
    const names = (id: string) => {
      const sport = byId.get(id);
      return {
        name: sport?.name,
        positions: Object.fromEntries((sport?.positions ?? []).map((p) => [p.id, p.name])),
      };
    };
    expect(names('volleyball')).toEqual({
      name: { 'pt-BR': 'Vôlei', en: 'Volleyball' },
      positions: {
        setter: { 'pt-BR': 'Levantador', en: 'Setter' },
        opposite: { 'pt-BR': 'Oposto', en: 'Opposite' },
        outside: { 'pt-BR': 'Ponteiro', en: 'Outside hitter' },
        middle: { 'pt-BR': 'Central', en: 'Middle blocker' },
        libero: { 'pt-BR': 'Líbero', en: 'Libero' },
      },
    });
    expect(names('soccer')).toEqual({
      name: { 'pt-BR': 'Futebol', en: 'Soccer' },
      positions: {
        goalkeeper: { 'pt-BR': 'Goleiro', en: 'Goalkeeper' },
        defender: { 'pt-BR': 'Zagueiro', en: 'Center back' },
        fullback: { 'pt-BR': 'Lateral', en: 'Full-back' },
        defensive_mid: { 'pt-BR': 'Volante', en: 'Defensive midfielder' },
        midfielder: { 'pt-BR': 'Meia', en: 'Midfielder' },
        forward: { 'pt-BR': 'Atacante', en: 'Forward' },
      },
    });
    expect(names('basketball')).toEqual({
      name: { 'pt-BR': 'Basquete', en: 'Basketball' },
      positions: {
        guard: { 'pt-BR': 'Armador', en: 'Guard' },
        wing: { 'pt-BR': 'Ala', en: 'Wing' },
        center: { 'pt-BR': 'Pivô', en: 'Center' },
      },
    });
  });
});
