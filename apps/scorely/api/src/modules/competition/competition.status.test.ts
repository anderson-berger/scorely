import type { StoredCompetition } from '@scorely/api/src/modules/competition/competition.repository';
import { competitionStatus } from '@scorely/api/src/modules/competition/competition.status';
import { COMPETITION_PRESETS } from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

// Competição, etapa 1 (`.claude/work/competicao-1.md`, D3): o estado sai da data `activeUntil`, num ponto só.
// Interface assumida (o arquivo de trabalho nomeia só a função): `competitionStatus(item | undefined, now: Date)`.

const NOW = new Date('2026-11-14T12:00:00.000Z');

function stored(activeUntil: string, plan: StoredCompetition['plan'] = 'trial'): StoredCompetition {
  return {
    groupId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    plan,
    activeUntil,
    trialStartedAt: '2026-10-01T12:00:00.000Z',
    rules: COMPETITION_PRESETS.classic,
    createdAt: '2026-10-01T12:00:00.000Z',
    updatedAt: '2026-10-01T12:00:00.000Z',
  };
}

describe('estado da competição pela data (CMP-01)', () => {
  it('CMP-01: o grupo nunca começou o teste (sem item) → desativada', () => {
    expect(competitionStatus(undefined, NOW)).toBe('inactive');
  });

  it('CMP-01: "ativa até" ainda não passou → ativa, no teste ou no plano', () => {
    expect(competitionStatus(stored('2026-11-14T12:00:00.001Z'), NOW)).toBe('active');
    expect(competitionStatus(stored('2027-01-01T00:00:00.000Z', 'paid'), NOW)).toBe('active');
  });

  it('CMP-01: "ativa até" já passou → vencida, no teste ou no plano', () => {
    expect(competitionStatus(stored('2026-11-14T11:59:59.999Z'), NOW)).toBe('expired');
    expect(competitionStatus(stored('2026-01-01T00:00:00.000Z', 'paid'), NOW)).toBe('expired');
  });

  it('CMP-01: no instante exato de "ativa até" já é vencida (a mesma conta da gravação, D5: activeUntil > agora)', () => {
    expect(competitionStatus(stored(NOW.toISOString()), NOW)).toBe('expired');
  });

  it('CMP-01: a data volta a ser futura → ativa de novo (nada foi apagado)', () => {
    const item = stored('2026-11-01T00:00:00.000Z');
    expect(competitionStatus(item, NOW)).toBe('expired');
    expect(competitionStatus({ ...item, plan: 'paid', activeUntil: '2026-12-31T00:00:00.000Z' }, NOW)).toBe(
      'active',
    );
  });
});
