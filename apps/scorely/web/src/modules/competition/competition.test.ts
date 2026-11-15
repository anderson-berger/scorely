import {
  ALL_PERMISSIONS,
  COMPETITION_PRESETS,
  type Competition,
  type Permission,
  type Tiebreak,
} from '@scorely/contracts';
import { i18n } from '@scorely/web/src/i18n/index';
import {
  canEditRules,
  moveTiebreak,
  pointsSummary,
  showsCompetitionRow,
  showsCompetitionTab,
  statusText,
  stepPoint,
  toggleTiebreak,
} from '@scorely/web/src/modules/competition/competition';
import { groupAccess } from '@scorely/web/src/modules/groups/permissions';
import { describe, expect, it } from 'vitest';

// Competição, etapa 1 (`.claude/work/competicao-1.md`, D7): as funções puras da aba Competição (CMP-09), da linha
// e do painel do regulamento nos Ajustes (CMP-10). Os textos são conferidos em pt-BR.

/** Quem vê: o dono (todas as permissões), o organizador (Admin, com seasons.manage) e quem não tem cargo. */
const owner = groupAccess({ myRoleId: 'owner', myPermissions: [...ALL_PERMISSIONS] });
const organizer = groupAccess({ myRoleId: 'admin', myPermissions: [...ALL_PERMISSIONS] });
const seasonsOnly = groupAccess({ myRoleId: 'member', myPermissions: ['seasons.manage'] as Permission[] });
const plain = groupAccess({ myRoleId: 'member', myPermissions: [] });

const INACTIVE: Competition = { status: 'inactive', trialAvailable: true };
const TRIAL: Competition = {
  status: 'active',
  plan: 'trial',
  activeUntil: '2026-12-14T12:00:00.000Z',
  trialAvailable: false,
  rules: COMPETITION_PRESETS.classic,
};
const PAID: Competition = { ...TRIAL, plan: 'paid', activeUntil: '2027-11-14T12:00:00.000Z' };
const EXPIRED: Competition = { ...TRIAL, status: 'expired', activeUntil: '2026-11-13T12:00:00.000Z' };

function render(text: { key: string; params?: Record<string, string | number> }): string {
  i18n.global.locale.value = 'pt-BR';
  return i18n.global.t(text.key, text.params ?? {});
}

/** Formatação da data de quem chama (no app, pelo fuso do perfil, D9): aqui, fixa e visível. */
const fmt = (iso: string) => `[${iso.slice(0, 10)}]`;

describe('a aba Competição (CMP-09)', () => {
  it('CMP-09: a aba aparece quando a competição não está desativada (no teste, no plano ou vencida)', () => {
    expect(showsCompetitionTab(TRIAL)).toBe(true);
    expect(showsCompetitionTab(PAID)).toBe(true);
    expect(showsCompetitionTab(EXPIRED)).toBe(true);
  });

  it('CMP-09: desativada, ou ainda sem a leitura da competição → sem a aba', () => {
    expect(showsCompetitionTab(INACTIVE)).toBe(false);
    expect(showsCompetitionTab(undefined)).toBe(false);
  });

  it('CMP-09: o estado no topo: "Teste até {data}", "Ativa até {data}" ou "Vencida em {data} · só leitura"', () => {
    expect(statusText(TRIAL, fmt)).toMatchObject({ key: 'competition.status.trial' });
    expect(render(statusText(TRIAL, fmt))).toBe('Teste até [2026-12-14]');
    expect(statusText(PAID, fmt)).toMatchObject({ key: 'competition.status.paid' });
    expect(render(statusText(PAID, fmt))).toBe('Ativa até [2027-11-14]');
    expect(statusText(EXPIRED, fmt)).toMatchObject({ key: 'competition.status.expired' });
    expect(render(statusText(EXPIRED, fmt))).toBe('Vencida em [2026-11-13] · só leitura');
  });

  it('CMP-09: vencida é "Vencida", no teste ou no plano', () => {
    expect(statusText({ ...EXPIRED, plan: 'paid' }, fmt)).toMatchObject({
      key: 'competition.status.expired',
    });
  });

  it('CMP-10: desativada → "Desativada"', () => {
    expect(statusText(INACTIVE, fmt)).toMatchObject({ key: 'competition.status.inactive' });
    expect(render(statusText(INACTIVE, fmt))).toBe('Desativada');
  });

  it('CMP-09: o organizador (seasons.manage) tem "Mudar regulamento" com a competição ativa', () => {
    for (const access of [owner, organizer, seasonsOnly]) {
      expect(canEditRules(TRIAL, access, false)).toBe(true);
      expect(canEditRules(PAID, access, false)).toBe(true);
    }
  });

  it('CMP-09: sem "Mudar regulamento" com a competição vencida ou desativada, nem com o grupo arquivado', () => {
    for (const access of [owner, organizer]) {
      expect(canEditRules(EXPIRED, access, false)).toBe(false);
      expect(canEditRules(INACTIVE, access, false)).toBe(false);
      expect(canEditRules(undefined, access, false)).toBe(false);
      expect(canEditRules(TRIAL, access, true)).toBe(false);
    }
  });

  it('CMP-09: quem não tem seasons.manage não tem "Mudar regulamento"', () => {
    expect(canEditRules(TRIAL, plain, false)).toBe(false);
  });
});

describe('a linha Competição nos Ajustes (CMP-10)', () => {
  it('CMP-10: com a competição desativada, só o dono vê a linha (para começar o teste)', () => {
    expect(showsCompetitionRow(INACTIVE, owner)).toBe(true);
    expect(showsCompetitionRow(INACTIVE, organizer)).toBe(false);
    expect(showsCompetitionRow(INACTIVE, seasonsOnly)).toBe(false);
    expect(showsCompetitionRow(INACTIVE, plain)).toBe(false);
  });

  it('CMP-10: com a competição ativa, o organizador (dono ou com seasons.manage) vê a linha', () => {
    for (const c of [TRIAL, PAID]) {
      expect(showsCompetitionRow(c, owner)).toBe(true);
      expect(showsCompetitionRow(c, organizer)).toBe(true);
      expect(showsCompetitionRow(c, seasonsOnly)).toBe(true);
      expect(showsCompetitionRow(c, plain)).toBe(false);
    }
  });

  it('CMP-10: com a competição vencida, o dono vê a linha ("Vencida em {data}")', () => {
    expect(showsCompetitionRow(EXPIRED, owner)).toBe(true);
    expect(showsCompetitionRow(EXPIRED, plain)).toBe(false);
  });

  it('CMP-10: sem a leitura da competição, ninguém vê a linha', () => {
    expect(showsCompetitionRow(undefined, owner)).toBe(false);
  });

  it('CMP-10: o resumo dos pontos é "V 3 · E 2 · D 1 · F −2" (Pelada clássica), com o menos tipográfico', () => {
    i18n.global.locale.value = 'pt-BR';
    const summary = pointsSummary(COMPETITION_PRESETS.classic.points)
      .map((p) => `${i18n.global.t(p.key)} ${p.value}`)
      .join(' · ');
    expect(summary).toBe('V 3 · E 2 · D 1 · F −2');
    expect(summary).not.toContain('-');
  });

  it('CMP-10: o resumo segue a ordem V, E, D, F com os valores do regulamento (zero é "0", sem sinal de mais)', () => {
    const values = pointsSummary({
      win: 1,
      draw: 0,
      loss: -1,
      notConfirmed: 5,
      noShow: -10,
      cancelled: 7,
    }).map((p) => p.value);
    expect(values).toEqual(['1', '0', '−1', '−10']);
  });

  it('CMP-10: no painel, mudar um ponto anda de 1 em 1 e fica preso em −10..10 (CMP-06)', () => {
    expect(stepPoint(3, 1)).toBe(4);
    expect(stepPoint(0, -1)).toBe(-1);
    expect(stepPoint(10, 1)).toBe(10);
    expect(stepPoint(-10, -1)).toBe(-10);
    expect(stepPoint(9, 1)).toBe(10);
    expect(stepPoint(-9, -1)).toBe(-10);
  });

  it('CMP-10: incluir um critério no desempate põe ele no fim; tirar remove e mantém a ordem dos outros', () => {
    expect(toggleTiebreak([], 'streak')).toEqual(['streak']);
    expect(toggleTiebreak(['attendance'], 'streak')).toEqual(['attendance', 'streak']);
    expect(toggleTiebreak(['attendance', 'streak'], 'attendance')).toEqual(['streak']);
    expect(toggleTiebreak(['streak'], 'streak')).toEqual([]);
  });

  it('CMP-06: incluir nunca repete um critério (incluir de novo é tirar)', () => {
    const list = toggleTiebreak(toggleTiebreak([], 'attendance'), 'attendance');
    expect(list).toEqual([]);
  });

  it('CMP-10: mudar a ordem do desempate troca com o vizinho; nas pontas, não muda nada', () => {
    const list: Tiebreak[] = ['attendance', 'streak'];
    expect(moveTiebreak(list, 0, 1)).toEqual(['streak', 'attendance']);
    expect(moveTiebreak(list, 1, -1)).toEqual(['streak', 'attendance']);
    expect(moveTiebreak(list, 0, -1)).toEqual(['attendance', 'streak']);
    expect(moveTiebreak(list, 1, 1)).toEqual(['attendance', 'streak']);
  });

  it('CMP-10: incluir, tirar e mudar a ordem não alteram a lista de entrada', () => {
    const list: Tiebreak[] = ['attendance', 'streak'];
    toggleTiebreak(list, 'attendance');
    moveTiebreak(list, 0, 1);
    expect(list).toEqual(['attendance', 'streak']);
  });
});
