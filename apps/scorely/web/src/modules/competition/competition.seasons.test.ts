import { COMPETITION_PRESETS, PublicUserIdSchema, type RankingRow, type Season } from '@scorely/contracts';
import { i18n } from '@scorely/web/src/i18n/index';
import {
  addDays,
  currentSeason,
  defaultSeasonDates,
  podiumOf,
  seasonStatusText,
  seasonTitle,
} from '@scorely/web/src/modules/competition/competition';
import { describe, expect, it } from 'vitest';

// Competição, etapa 5 (`.claude/work/competicao-5.md`, D8): as funções puras das temporadas na tela (CMP-29, 33, 35).
// Os textos são conferidos em pt-BR; as datas passam pelos formatadores recebidos (aqui, marcados).

interface Text {
  key: string;
  params?: Record<string, string | number>;
}

function render(text: Text): string {
  i18n.global.locale.value = 'pt-BR';
  return i18n.global.t(text.key, text.params ?? {});
}

/** Formatadores marcados: provam qual data entrou em cada texto. */
const date = (local: string) => `D(${local})`;
const instant = (iso: string) => `I(${iso})`;

function season(extra: Partial<Season> = {}): Season {
  return {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    number: 3,
    name: 'Verão 2027',
    startDate: '2026-11-01',
    endDate: '2026-11-24',
    state: 'open',
    rules: COMPETITION_PRESETS.classic,
    graceUntil: '2026-11-28T03:00:00.000Z',
    ...extra,
  };
}

function row(id: string, position: number): RankingRow {
  return {
    userId: PublicUserIdSchema.parse(id),
    position,
    points: 10,
    attendance: 1,
    streak: 1,
    record: { wins: 0, draws: 0, losses: 0 },
  };
}

describe('o nome da temporada (CMP-29)', () => {
  it('CMP-29: com nome, o título é o nome', () => {
    const text = seasonTitle(season({ name: 'Verão 2027' }));
    expect(text.key).toBe('competition.seasons.named');
    expect(render(text)).toBe('Verão 2027');
  });

  it('CMP-29: sem nome, a temporada é "Temporada N" (a ordem de criação no grupo)', () => {
    const { name: _omit, ...unnamed } = season({ number: 3 });
    const text = seasonTitle(unnamed);
    expect(text).toEqual({ key: 'competition.seasons.defaultName', params: { n: 3 } });
    expect(render(text)).toBe('Temporada 3');
  });
});

describe('o card da temporada (CMP-35)', () => {
  const today = '2026-11-14';

  it('CMP-35: aberta: "até {fim} · faltam {dias} dias"', () => {
    const text = seasonStatusText(season({ state: 'open', endDate: '2026-11-24' }), today, date, instant);
    expect(text).toEqual({
      key: 'competition.seasons.status.open',
      params: { date: 'D(2026-11-24)', days: 10 },
    });
    expect(render(text)).toBe('até D(2026-11-24) · faltam 10 dias');
  });

  it('CMP-35: programada: "programada: começa {início}"', () => {
    const text = seasonStatusText(
      season({ state: 'scheduled', startDate: '2026-12-01', endDate: '2027-01-31' }),
      today,
      date,
      instant,
    );
    expect(text).toEqual({ key: 'competition.seasons.status.scheduled', params: { date: 'D(2026-12-01)' } });
    expect(render(text)).toBe('programada: começa D(2026-12-01)');
  });

  it('CMP-35: no prazo: "no prazo: fechar os jogos até {fim do prazo}", pelo instante do prazo', () => {
    const text = seasonStatusText(
      season({ state: 'grace', endDate: '2026-11-12', graceUntil: '2026-11-16T03:00:00.000Z' }),
      today,
      date,
      instant,
    );
    expect(text).toEqual({
      key: 'competition.seasons.status.grace',
      params: { date: 'I(2026-11-16T03:00:00.000Z)' },
    });
    expect(render(text)).toBe('no prazo: fechar os jogos até I(2026-11-16T03:00:00.000Z)');
  });

  it('CMP-35: encerrada: o texto leva a data de fim', () => {
    const text = seasonStatusText(season({ state: 'closed', endDate: '2026-11-10' }), today, date, instant);
    expect(text).toEqual({ key: 'competition.seasons.status.closed', params: { date: 'D(2026-11-10)' } });
  });

  it('CMP-35: o card mostra a aberta ou a que está no prazo; sem nenhuma das duas, "Sem temporada"', () => {
    const closed = season({ id: 'aaaaaaaa-0000-4000-8000-000000000002', state: 'closed' });
    const scheduled = season({ id: 'aaaaaaaa-0000-4000-8000-000000000003', state: 'scheduled' });
    const open = season({ id: 'aaaaaaaa-0000-4000-8000-000000000004', state: 'open' });
    const grace = season({ id: 'aaaaaaaa-0000-4000-8000-000000000005', state: 'grace' });

    expect(currentSeason([scheduled, open, closed])?.id).toBe(open.id);
    expect(currentSeason([scheduled, grace, closed])?.id).toBe(grace.id);
    expect(currentSeason([scheduled, closed])).toBeUndefined();
    expect(currentSeason([])).toBeUndefined();
  });

  it('CMP-35: abrir agora sugere de hoje a +90 dias', () => {
    expect(defaultSeasonDates('2026-11-14')).toEqual({ startDate: '2026-11-14', endDate: '2027-02-12' });
  });

  it('CMP-35: somar dias nas datas locais vira o mês e o ano, com o ano bissexto', () => {
    expect(addDays('2026-11-14', 0)).toBe('2026-11-14');
    expect(addDays('2026-11-14', 10)).toBe('2026-11-24');
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
  });
});

describe('o pódio (CMP-33)', () => {
  it('CMP-33: na ordem das posições, com todos os empatados', () => {
    const podium = [row('CCCC3333', 3), row('AAAA1111', 1), row('DDDD4444', 3), row('BBBB2222', 2)];
    const res = podiumOf(season({ state: 'closed', podium }));
    expect(res.map((r) => r.position)).toEqual([1, 2, 3, 3]);
    expect(res.map((r) => r.userId).slice(0, 2)).toEqual(['AAAA1111', 'BBBB2222']);
    expect(res.length).toBe(4);
  });

  it('CMP-33: sem pódio (temporada não encerrada), a lista vem vazia', () => {
    expect(podiumOf(season({ state: 'open' }))).toEqual([]);
  });
});
