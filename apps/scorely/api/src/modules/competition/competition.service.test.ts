import { AppError, appError } from '@scorely/api/src/lib/errors';
import { asUserId } from '@scorely/api/src/lib/ids';
import type {
  CompetitionRepository,
  StoredCompetition,
} from '@scorely/api/src/modules/competition/competition.repository';
import { createCompetitionService } from '@scorely/api/src/modules/competition/competition.service';
import type { GroupRepository, StoredGroup } from '@scorely/api/src/modules/groups/group.repository';
import {
  COMPETITION_POINTS,
  COMPETITION_PRESETS,
  COMPETITION_TRIAL_DAYS,
  type CompetitionRules,
  CompetitionRulesSchema,
  CompetitionSchema,
  type ErrorCode,
  type MemberTier,
  type RoleId,
  UpdateCompetitionRulesInputSchema,
} from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

/** ADR 0016: o que o banco faz na gravação condicionada pela versão (o repositório lança o mesmo erro). */
function expectVersionIn(current: number, expected: number): void {
  if (current !== expected) throw appError('VERSION_CONFLICT', { currentVersion: current });
}

// Competição, etapa 1 (`.claude/work/competicao-1.md`): ativação (CMP-01–05) e regulamento (CMP-06–08).
// Interface assumida (o arquivo de trabalho dá D3–D6, mas não as assinaturas; ver o relatório do test-writer):
//   competition.repository.ts:
//     `StoredCompetition = { groupId, plan, activeUntil, trialStartedAt, rules, createdAt, updatedAt }`;
//     `CompetitionRepository {
//        get(groupId): Promise<StoredCompetition | undefined>;
//        create(item): Promise<void>;                      // D4: já existe → appError('COMPETITION_TRIAL_USED')
//        updateRules(groupId, rules, now: string): Promise<void>; // D5: activeUntil <= now → appError('COMPETITION_INACTIVE')
//      }`;
//   competition.service.ts: `createCompetitionService({ groups, competitions, now })` com
//     `get(userId, groupId)`, `startTrial(userId, groupId)` e `updateRules(userId, groupId, rules)`, todos devolvendo
//     a `Competition` do contrato.

/** GRP-10, 64: o horário do grupo (sexta 19:00–22:00) e o id do jogo dele numa data (`<scheduleId>_<data>`). */
const SCHEDULE_ID = 'eeeeeeee-0000-4000-8000-000000000001';
const SCHEDULE = {
  id: SCHEDULE_ID,
  groupId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  version: 1,
  weekday: 5,
  start: '19:00',
  end: '22:00',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};
const GROUP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_GROUP_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OWNER = asUserId('11111111-1111-4111-8111-111111111111');
const A = asUserId('22222222-2222-4222-8222-222222222222');
const R = asUserId('88888888-8888-4888-8888-888888888888');
const OUTSIDER = asUserId('66666666-6666-4666-8666-666666666666');

const NOW = new Date('2026-11-14T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const TRIAL_END = new Date(NOW.getTime() + COMPETITION_TRIAL_DAYS * DAY).toISOString();
const ARCHIVED = { archivedAt: '2026-11-10T00:00:00.000Z' };

const CUSTOM: CompetitionRules = {
  points: { win: 5, draw: 1, loss: 0, notConfirmed: -1, noShow: -10, cancelled: 10 },
  unit: 'match',
  tiebreak: ['streak'],
};

function storedGroup(extra: Partial<StoredGroup> = {}): StoredGroup {
  return {
    id: GROUP_ID,
    createdAt: '2026-01-01T00:00:00.000Z',
    name: 'Vôlei de sexta',
    sportId: 'volleyball',
    schedules: [SCHEDULE],
    timeZone: 'America/Sao_Paulo',
    slots: 12,
    listOpensHoursBefore: 48,
    reservesOpenHoursBefore: 24,
    guestsOpenHoursBefore: 12,
    inviteToken: 'tok-member',
    reserveInviteToken: 'tok-reserve',
    guestToken: 'tok-guest',
    maxMembers: 30,
    maxReserves: 30,
    version: 1,
    settingsVersion: 1,
    ...extra,
  };
}

/** Competição já gravada (o teste foi começado em outubro). */
function storedCompetition(extra: Partial<StoredCompetition> = {}): StoredCompetition {
  return {
    groupId: GROUP_ID,
    plan: 'trial',
    activeUntil: '2026-12-01T00:00:00.000Z',
    trialStartedAt: '2026-11-01T00:00:00.000Z',
    rules: COMPETITION_PRESETS.classic,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    version: 1,
    ...extra,
  };
}

const unused = () => Promise.reject(new Error('not used by the competition'));

/**
 * Contexto em memória. O repositório da competição segue as condições do DynamoDB (D4, D5): criar com o item
 * já existente e mudar o regulamento com `activeUntil <= agora` falham. `state.staleRead` faz o `get` devolver
 * uma leitura antiga, para simular a corrida entre a leitura e a gravação.
 */
function setup(opts: { group?: Partial<StoredGroup>; competition?: Partial<StoredCompetition> | null } = {}) {
  const clock = { now: NOW };
  const state = {
    group: storedGroup(opts.group),
    members: { [OWNER]: 'member', [A]: 'member', [R]: 'reserve' } as Record<string, MemberTier>,
    staff: {} as Record<string, RoleId>,
    staleRead: undefined as { item: StoredCompetition | undefined } | undefined,
  };
  const store = new Map<string, StoredCompetition>();
  if (opts.competition !== undefined && opts.competition !== null)
    store.set(GROUP_ID, storedCompetition(opts.competition));
  const writes: { op: 'create' | 'updateRules'; groupId: string }[] = [];

  const groups: GroupRepository = {
    get: async (id) => (id === state.group.id ? state.group : undefined),
    roleOf: async (groupId, userId) => (groupId === state.group.id ? state.members[userId] : undefined),
    getByToken: unused,
    create: unused,
    addMember: unused,
    counts: unused,
    getMembership: async (groupId, userId) => {
      const role = groupId === state.group.id ? state.members[userId] : undefined;
      if (!role) return undefined;
      return { tier: role, roleId: state.staff[userId] ?? (userId === OWNER ? 'owner' : 'member') };
    },
    setStaffRole: unused,
    transfer: unused,
    setMemberInvite: unused,
    clearMemberInvite: unused,
    acceptMemberInvite: unused,
    listMembers: unused,
    groupsOf: unused,
    rotateToken: unused,
    archive: unused,
    unarchive: unused,
    update: unused,
    rename: unused,
    removeMember: unused,
  };

  const competitions: CompetitionRepository = {
    get: async (groupId) => {
      if (state.staleRead) return structuredClone(state.staleRead.item);
      const item = store.get(groupId);
      return item ? structuredClone(item) : undefined;
    },
    create: async (item) => {
      if (store.has(item.groupId)) throw appError('COMPETITION_TRIAL_USED');
      writes.push({ op: 'create', groupId: item.groupId });
      store.set(item.groupId, { ...structuredClone(item), version: 1 });
    },
    /** CMP-42 (ADR 0016): além de ativa, grava só com a versão atual; a nova é a atual + 1. */
    updateRules: async (groupId, rules, now, expectedVersion) => {
      const item = store.get(groupId);
      if (!item || !(item.activeUntil > now)) throw appError('COMPETITION_INACTIVE');
      expectVersionIn(item.version, expectedVersion);
      writes.push({ op: 'updateRules', groupId });
      store.set(groupId, {
        ...item,
        rules: structuredClone(rules),
        updatedAt: now,
        version: item.version + 1,
      });
    },
  };

  const service = createCompetitionService({ groups, competitions, now: () => clock.now });
  /** CMP-42: a versão da competição que a tela mostrou (`0` sem competição). */
  const cv = () => ({ version: store.get(GROUP_ID)?.version ?? 0 });
  return { clock, state, store, writes, service, cv };
}

async function expectAppError(p: Promise<unknown>, code: ErrorCode, status: number): Promise<AppError> {
  const err = await p.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  expect(err).toMatchObject({ code, status });
  return err as AppError;
}

describe('estado da competição na leitura (CMP-01, CMP-05)', () => {
  it('CMP-01: grupo que nunca começou o teste → desativada, com o teste disponível e sem plano, data nem regulamento', async () => {
    const t = setup();
    const res = await t.service.get(OWNER, GROUP_ID);
    expect(CompetitionSchema.parse(res)).toEqual(res);
    expect(res).toEqual({ status: 'inactive', trialAvailable: true });
    expect(t.writes).toEqual([]);
  });

  it('CMP-01: "ativa até" no futuro → ativa, com o plano, a data e o regulamento', async () => {
    const t = setup({ competition: {} });
    expect(await t.service.get(OWNER, GROUP_ID)).toEqual({
      status: 'active',
      plan: 'trial',
      activeUntil: '2026-12-01T00:00:00.000Z',
      trialAvailable: false,
      rules: COMPETITION_PRESETS.classic,
      version: 1,
    });
  });

  it('CMP-01: "ativa até" no passado → vencida, e nada foi apagado (plano, data e regulamento continuam)', async () => {
    const t = setup({ competition: { activeUntil: '2026-11-13T00:00:00.000Z', rules: CUSTOM } });
    expect(await t.service.get(OWNER, GROUP_ID)).toEqual({
      status: 'expired',
      plan: 'trial',
      activeUntil: '2026-11-13T00:00:00.000Z',
      trialAvailable: false,
      rules: CUSTOM,
      version: 1,
    });
  });

  it('CMP-01: o estado sai da data na leitura: o mesmo item vira vencido quando o relógio passa de "ativa até"', async () => {
    const t = setup({ competition: {} });
    expect((await t.service.get(OWNER, GROUP_ID)).status).toBe('active');
    t.clock.now = new Date('2026-12-01T00:00:00.001Z');
    expect((await t.service.get(OWNER, GROUP_ID)).status).toBe('expired');
    expect(t.writes).toEqual([]);
  });

  it('CMP-05: membro e reserva, com ou sem cargo, veem o estado e o regulamento', async () => {
    const t = setup({ competition: { rules: CUSTOM } });
    for (const who of [OWNER, A, R]) {
      const res = await t.service.get(who, GROUP_ID);
      expect(res).toMatchObject({ status: 'active', rules: CUSTOM });
    }
  });

  it('CMP-05: com a competição vencida e com o grupo arquivado, quem participa continua vendo', async () => {
    const t = setup({
      group: ARCHIVED,
      competition: { activeUntil: '2026-11-01T00:00:00.000Z', rules: CUSTOM },
    });
    for (const who of [OWNER, A, R]) {
      expect(await t.service.get(who, GROUP_ID)).toMatchObject({ status: 'expired', rules: CUSTOM });
    }
  });

  it('CMP-05: quem não participa (convidado ou de fora), ou grupo inexistente → GROUP_NOT_FOUND (404)', async () => {
    const t = setup({ competition: {} });
    await expectAppError(t.service.get(OUTSIDER, GROUP_ID), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.service.get(OWNER, OTHER_GROUP_ID), 'GROUP_NOT_FOUND', 404);
  });
});

describe('começar o teste (CMP-02)', () => {
  it('CMP-02: o dono começa o teste: 30 dias a partir de agora, com o regulamento da Pelada clássica', async () => {
    const t = setup();
    const res = await t.service.startTrial(OWNER, GROUP_ID);

    expect(CompetitionSchema.parse(res)).toEqual(res);
    expect(res).toEqual({
      status: 'active',
      plan: 'trial',
      activeUntil: TRIAL_END,
      trialAvailable: false,
      rules: COMPETITION_PRESETS.classic,
      version: 1,
    });
    expect(t.store.get(GROUP_ID)).toEqual({
      groupId: GROUP_ID,
      plan: 'trial',
      activeUntil: TRIAL_END,
      trialStartedAt: NOW.toISOString(),
      rules: COMPETITION_PRESETS.classic,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      version: 1,
    });
    expect(await t.service.get(A, GROUP_ID)).toEqual(res);
  });

  it('CMP-02: o teste dura COMPETITION_TRIAL_DAYS = 30 dias', () => {
    expect(COMPETITION_TRIAL_DAYS).toBe(30);
  });

  it('CMP-02: o grupo que já usou o teste (ativo, vencido ou no plano) → COMPETITION_TRIAL_USED (409), sem mudar nada', async () => {
    for (const competition of [
      {},
      { activeUntil: '2026-11-01T00:00:00.000Z' },
      { plan: 'paid' as const, activeUntil: '2027-06-01T00:00:00.000Z' },
    ]) {
      const t = setup({ competition });
      const before = structuredClone(t.store.get(GROUP_ID));
      await expectAppError(t.service.startTrial(OWNER, GROUP_ID), 'COMPETITION_TRIAL_USED', 409);
      expect(t.store.get(GROUP_ID)).toEqual(before);
      expect(t.writes).toEqual([]);
    }
  });

  it('CMP-02: uma vez por grupo, não por pessoa: o novo dono de um grupo que já usou o teste → COMPETITION_TRIAL_USED', async () => {
    const t = setup({ competition: { activeUntil: '2026-11-01T00:00:00.000Z' } });
    // GRP-54: o dono agora é A (cargo Dono na participação); o dono antigo vira Admin.
    t.state.staff[A] = 'owner';
    t.state.staff[OWNER] = 'admin';
    await expectAppError(t.service.startTrial(A, GROUP_ID), 'COMPETITION_TRIAL_USED', 409);
  });

  it('CMP-02: começar duas vezes → a 2ª responde COMPETITION_TRIAL_USED, e o "ativa até" não muda', async () => {
    const t = setup();
    await t.service.startTrial(OWNER, GROUP_ID);
    t.clock.now = new Date(NOW.getTime() + 5 * DAY);
    await expectAppError(t.service.startTrial(OWNER, GROUP_ID), 'COMPETITION_TRIAL_USED', 409);
    expect(t.store.get(GROUP_ID)?.activeUntil).toBe(TRIAL_END);
  });

  it('CMP-02: dois toques ao mesmo tempo (os dois leram "desativada") → um só teste; o outro recebe COMPETITION_TRIAL_USED', async () => {
    const t = setup();
    t.state.staleRead = { item: undefined };
    await t.service.startTrial(OWNER, GROUP_ID);
    await expectAppError(t.service.startTrial(OWNER, GROUP_ID), 'COMPETITION_TRIAL_USED', 409);
    expect(t.writes).toEqual([{ op: 'create', groupId: GROUP_ID }]);
  });

  it('CMP-02: quem não é dono (membro, reserva, ou com o cargo Admin) → GROUP_NOT_OWNER (403), sem gravar', async () => {
    const t = setup();
    for (const who of [A, R]) {
      await expectAppError(t.service.startTrial(who, GROUP_ID), 'GROUP_NOT_OWNER', 403);
      t.state.staff[who] = 'admin';
      await expectAppError(t.service.startTrial(who, GROUP_ID), 'GROUP_NOT_OWNER', 403);
    }
    expect(t.writes).toEqual([]);
    expect(t.store.size).toBe(0);
  });

  it('CMP-02: quem não participa, ou grupo inexistente → GROUP_NOT_FOUND (404)', async () => {
    const t = setup();
    await expectAppError(t.service.startTrial(OUTSIDER, GROUP_ID), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.service.startTrial(OWNER, OTHER_GROUP_ID), 'GROUP_NOT_FOUND', 404);
    expect(t.writes).toEqual([]);
  });

  it('CMP-02: grupo arquivado → GROUP_ARCHIVED (409) para o dono, sem gravar; quem não é dono recebe antes GROUP_NOT_OWNER', async () => {
    const t = setup({ group: ARCHIVED });
    await expectAppError(t.service.startTrial(OWNER, GROUP_ID), 'GROUP_ARCHIVED', 409);
    await expectAppError(t.service.startTrial(A, GROUP_ID), 'GROUP_NOT_OWNER', 403);
    await expectAppError(t.service.startTrial(OUTSIDER, GROUP_ID), 'GROUP_NOT_FOUND', 404);
    expect(t.writes).toEqual([]);
  });
});

describe('o plano depois do teste (CMP-03)', () => {
  it('CMP-03: a equipe libera o plano mudando "ativa até": a competição volta ativa, no plano, de onde parou', async () => {
    const t = setup({ competition: { activeUntil: '2026-11-01T00:00:00.000Z', rules: CUSTOM } });
    expect((await t.service.get(OWNER, GROUP_ID)).status).toBe('expired');

    const item = t.store.get(GROUP_ID) as StoredCompetition;
    t.store.set(GROUP_ID, { ...item, plan: 'paid', activeUntil: '2027-11-14T00:00:00.000Z' });

    expect(await t.service.get(A, GROUP_ID)).toEqual({
      status: 'active',
      plan: 'paid',
      activeUntil: '2027-11-14T00:00:00.000Z',
      trialAvailable: false,
      rules: CUSTOM,
      version: 1,
    });
    expect(
      await t.service.updateRules(OWNER, GROUP_ID, { ...COMPETITION_PRESETS.winsOnly, ...t.cv() }),
    ).toMatchObject({
      status: 'active',
      rules: COMPETITION_PRESETS.winsOnly,
    });
  });
});

describe('só leitura quando desativada ou vencida (CMP-04)', () => {
  it('CMP-04: desativada → mudar o regulamento responde COMPETITION_INACTIVE (409), sem gravar', async () => {
    const t = setup();
    await expectAppError(
      t.service.updateRules(OWNER, GROUP_ID, { ...CUSTOM, ...t.cv() }),
      'COMPETITION_INACTIVE',
      409,
    );
    expect(t.writes).toEqual([]);
    expect(t.store.size).toBe(0);
  });

  it('CMP-04: vencida → COMPETITION_INACTIVE (409) para o dono e para o Admin; o regulamento fica como estava', async () => {
    const t = setup({ competition: { activeUntil: '2026-11-13T00:00:00.000Z' } });
    t.state.staff[A] = 'admin';
    for (const who of [OWNER, A])
      await expectAppError(
        t.service.updateRules(who, GROUP_ID, { ...CUSTOM, ...t.cv() }),
        'COMPETITION_INACTIVE',
        409,
      );
    expect(t.writes).toEqual([]);
    expect((await t.service.get(OWNER, GROUP_ID)).rules).toEqual(COMPETITION_PRESETS.classic);
  });

  it('CMP-04: venceu entre a leitura e a gravação → COMPETITION_INACTIVE, sem gravar', async () => {
    const t = setup({ competition: { activeUntil: '2026-11-13T00:00:00.000Z' } });
    t.state.staleRead = { item: storedCompetition() };
    await expectAppError(
      t.service.updateRules(OWNER, GROUP_ID, { ...CUSTOM, ...t.cv() }),
      'COMPETITION_INACTIVE',
      409,
    );
    expect(t.writes).toEqual([]);
  });
});

describe('o regulamento (CMP-06)', () => {
  const valid = (rules: unknown) => CompetitionRulesSchema.safeParse(rules).success;
  const withPoints = (points: Partial<Record<keyof CompetitionRules['points'], unknown>>) => ({
    ...CUSTOM,
    points: { ...CUSTOM.points, ...points },
  });

  it('CMP-06: os 6 pontos são inteiros de −10 a 10', () => {
    expect(COMPETITION_POINTS).toEqual({ min: -10, max: 10 });
    for (const key of ['win', 'draw', 'loss', 'notConfirmed', 'noShow', 'cancelled'] as const) {
      expect(valid(withPoints({ [key]: -10 }))).toBe(true);
      expect(valid(withPoints({ [key]: 10 }))).toBe(true);
      expect(valid(withPoints({ [key]: 0 }))).toBe(true);
      expect(valid(withPoints({ [key]: 11 }))).toBe(false);
      expect(valid(withPoints({ [key]: -11 }))).toBe(false);
      expect(valid(withPoints({ [key]: 1.5 }))).toBe(false);
      expect(valid(withPoints({ [key]: '3' }))).toBe(false);
    }
  });

  it('CMP-06: o regulamento vem inteiro: faltando um ponto, a unidade ou o desempate → recusado (VALIDATION_ERROR)', () => {
    const { noShow: _n, ...fivePoints } = CUSTOM.points;
    expect(valid({ ...CUSTOM, points: fivePoints })).toBe(false);
    const { unit: _u, ...noUnit } = CUSTOM;
    expect(valid(noUnit)).toBe(false);
    const { tiebreak: _t, ...noTiebreak } = CUSTOM;
    expect(valid(noTiebreak)).toBe(false);
  });

  it('CMP-06: a unidade é por partida ou pelo dia', () => {
    expect(valid({ ...CUSTOM, unit: 'match' })).toBe(true);
    expect(valid({ ...CUSTOM, unit: 'day' })).toBe(true);
    expect(valid({ ...CUSTOM, unit: 'season' })).toBe(false);
  });

  it('CMP-06: o desempate é uma lista ordenada, sem repetir, do catálogo (mais presente, maior sequência), e pode ficar vazia', () => {
    expect(valid({ ...CUSTOM, tiebreak: [] })).toBe(true);
    expect(valid({ ...CUSTOM, tiebreak: ['attendance'] })).toBe(true);
    expect(valid({ ...CUSTOM, tiebreak: ['attendance', 'streak'] })).toBe(true);
    expect(valid({ ...CUSTOM, tiebreak: ['streak', 'attendance'] })).toBe(true);
    expect(valid({ ...CUSTOM, tiebreak: ['attendance', 'attendance'] })).toBe(false);
    expect(valid({ ...CUSTOM, tiebreak: ['streak', 'attendance', 'streak'] })).toBe(false);
    expect(valid({ ...CUSTOM, tiebreak: ['mvp'] })).toBe(false);
  });

  it('CMP-06: a ordem do desempate é guardada como veio', async () => {
    const t = setup({ competition: {} });
    const rules = { ...CUSTOM, tiebreak: ['streak', 'attendance'] } satisfies CompetitionRules;
    await t.service.updateRules(OWNER, GROUP_ID, { ...rules, ...t.cv() });
    expect((await t.service.get(A, GROUP_ID)).rules?.tiebreak).toEqual(['streak', 'attendance']);
  });
});

describe('mudar o regulamento (CMP-07)', () => {
  it('CMP-07: o dono manda o regulamento inteiro, recebe a competição de volta e o GET devolve o novo', async () => {
    const t = setup({ competition: {} });
    const res = await t.service.updateRules(OWNER, GROUP_ID, { ...CUSTOM, ...t.cv() });

    expect(CompetitionSchema.parse(res)).toEqual(res);
    expect(res).toEqual({
      status: 'active',
      plan: 'trial',
      activeUntil: '2026-12-01T00:00:00.000Z',
      trialAvailable: false,
      rules: CUSTOM,
      version: 2,
    });
    expect(t.writes).toEqual([{ op: 'updateRules', groupId: GROUP_ID }]);
    expect(t.store.get(GROUP_ID)).toMatchObject({ rules: CUSTOM, updatedAt: NOW.toISOString() });
    expect(await t.service.get(R, GROUP_ID)).toEqual(res);
  });

  it('CMP-07: mudar não mexe no plano, no "ativa até" nem no início do teste', async () => {
    const t = setup({ competition: { plan: 'paid', activeUntil: '2027-01-01T00:00:00.000Z' } });
    await t.service.updateRules(OWNER, GROUP_ID, { ...CUSTOM, ...t.cv() });
    expect(t.store.get(GROUP_ID)).toMatchObject({
      plan: 'paid',
      activeUntil: '2027-01-01T00:00:00.000Z',
      trialStartedAt: '2026-11-01T00:00:00.000Z',
    });
  });

  it('CMP-07: salvar de novo substitui o regulamento inteiro (critério tirado do desempate some)', async () => {
    const t = setup({ competition: {} });
    await t.service.updateRules(OWNER, GROUP_ID, { ...CUSTOM, ...t.cv() });
    const next: CompetitionRules = { ...COMPETITION_PRESETS.attendance, tiebreak: [] };
    expect((await t.service.updateRules(OWNER, GROUP_ID, { ...next, ...t.cv() })).rules).toEqual(next);
    expect((await t.service.get(OWNER, GROUP_ID)).rules).toEqual(next);
  });

  it('CMP-07: membro e reserva com o cargo Admin (seasons.manage) mudam o regulamento', async () => {
    const t = setup({ competition: {} });
    for (const who of [A, R]) {
      t.state.staff[who] = 'admin';
      expect((await t.service.updateRules(who, GROUP_ID, { ...CUSTOM, ...t.cv() })).rules).toEqual(CUSTOM);
    }
    expect(t.writes).toHaveLength(2);
  });

  it('CMP-07: membro e reserva sem cargo → GROUP_PERMISSION_DENIED (403) com details.permission = seasons.manage, sem gravar', async () => {
    const t = setup({ competition: {} });
    for (const who of [A, R]) {
      const err = await expectAppError(
        t.service.updateRules(who, GROUP_ID, { ...CUSTOM, ...t.cv() }),
        'GROUP_PERMISSION_DENIED',
        403,
      );
      expect(err.details).toEqual({ permission: 'seasons.manage' });
    }
    expect(t.writes).toEqual([]);
  });

  it('CMP-07: a permissão vem antes do estado e do arquivado (sem cargo, com a competição desativada, vencida ou o grupo arquivado → GROUP_PERMISSION_DENIED)', async () => {
    for (const ctx of [
      { competition: null },
      { competition: { activeUntil: '2026-11-01T00:00:00.000Z' } },
      { competition: {}, group: ARCHIVED },
    ]) {
      const t = setup(ctx);
      await expectAppError(
        t.service.updateRules(A, GROUP_ID, { ...CUSTOM, ...t.cv() }),
        'GROUP_PERMISSION_DENIED',
        403,
      );
    }
  });

  it('CMP-07: quem não participa, ou grupo inexistente → GROUP_NOT_FOUND (404)', async () => {
    const t = setup({ competition: {} });
    await expectAppError(
      t.service.updateRules(OUTSIDER, GROUP_ID, { ...CUSTOM, ...t.cv() }),
      'GROUP_NOT_FOUND',
      404,
    );
    await expectAppError(
      t.service.updateRules(OWNER, OTHER_GROUP_ID, { ...CUSTOM, ...t.cv() }),
      'GROUP_NOT_FOUND',
      404,
    );
    expect(t.writes).toEqual([]);
  });

  it('CMP-07: grupo arquivado, com a competição ativa → GROUP_ARCHIVED (409) para o dono e o Admin, sem gravar', async () => {
    const t = setup({ competition: {}, group: ARCHIVED });
    t.state.staff[A] = 'admin';
    for (const who of [OWNER, A])
      await expectAppError(
        t.service.updateRules(who, GROUP_ID, { ...CUSTOM, ...t.cv() }),
        'GROUP_ARCHIVED',
        409,
      );
    expect(t.writes).toEqual([]);
  });
});

describe('modelos prontos (CMP-08)', () => {
  it('CMP-08: Pelada clássica: V 3 · E 2 · D 1 · não confirmou 0 · F −2 · cancelado 0, pelo dia, mais presente → maior sequência', () => {
    expect(COMPETITION_PRESETS.classic).toEqual({
      points: { win: 3, draw: 2, loss: 1, notConfirmed: 0, noShow: -2, cancelled: 0 },
      unit: 'day',
      tiebreak: ['attendance', 'streak'],
    });
  });

  it('CMP-08: Só vitórias: V 1 e o resto 0, por partida, mais presente', () => {
    expect(COMPETITION_PRESETS.winsOnly).toEqual({
      points: { win: 1, draw: 0, loss: 0, notConfirmed: 0, noShow: 0, cancelled: 0 },
      unit: 'match',
      tiebreak: ['attendance'],
    });
  });

  it('CMP-08: Presença conta: V 3 · E 2 · D 2 · não confirmou 0 · F −3 · cancelado 1, pelo dia, maior sequência → mais presente', () => {
    expect(COMPETITION_PRESETS.attendance).toEqual({
      points: { win: 3, draw: 2, loss: 2, notConfirmed: 0, noShow: -3, cancelled: 1 },
      unit: 'day',
      tiebreak: ['streak', 'attendance'],
    });
  });

  it('CMP-08: os 3 modelos são regulamentos válidos (o contrato aceita cada um)', () => {
    for (const preset of Object.values(COMPETITION_PRESETS)) {
      expect(CompetitionRulesSchema.parse(preset)).toEqual(preset);
    }
  });

  it('CMP-08: o app não guarda qual modelo foi escolhido: o modelo só preenche, e um valor mudado depois é salvo como veio', async () => {
    const t = setup({ competition: {} });
    const fromPreset: CompetitionRules = {
      ...COMPETITION_PRESETS.winsOnly,
      points: { ...COMPETITION_PRESETS.winsOnly.points, noShow: -3 },
    };
    const res = await t.service.updateRules(OWNER, GROUP_ID, { ...fromPreset, ...t.cv() });
    expect(res.rules).toEqual(fromPreset);
    expect(Object.keys(res).some((k) => /preset/i.test(k))).toBe(false);
    expect(Object.keys(t.store.get(GROUP_ID) ?? {}).some((k) => /preset/i.test(k))).toBe(false);
  });
});

describe('regulamento com a versão que a tela mostrou (CMP-42)', () => {
  it('CMP-42: a competição sai com a version, e mudar o regulamento com ela soma 1', async () => {
    const t = setup({ competition: { version: 3 } });
    expect((await t.service.get(OWNER, GROUP_ID)).version).toBe(3);
    const res = await t.service.updateRules(OWNER, GROUP_ID, { ...CUSTOM, version: 3 });
    expect(res).toMatchObject({ rules: CUSTOM, version: 4 });
    expect(t.store.get(GROUP_ID)?.version).toBe(4);
  });

  it('CMP-42: o regulamento mudou antes → VERSION_CONFLICT (409, currentVersion) e nada é gravado', async () => {
    const t = setup({ competition: { version: 3 } });
    const err = await expectAppError(
      t.service.updateRules(OWNER, GROUP_ID, { ...CUSTOM, version: 2 }),
      'VERSION_CONFLICT',
      409,
    );
    expect(err.details).toEqual({ currentVersion: 3 });
    expect(t.writes).toEqual([]);
    expect(t.store.get(GROUP_ID)?.rules).toEqual(COMPETITION_PRESETS.classic);
  });

  it('CMP-42: a version não entra no regulamento guardado', async () => {
    const t = setup({ competition: {} });
    await t.service.updateRules(OWNER, GROUP_ID, { ...CUSTOM, version: 1 });
    expect(t.store.get(GROUP_ID)?.rules).toEqual(CUSTOM);
    expect((await t.service.get(OWNER, GROUP_ID)).rules).toEqual(CUSTOM);
  });

  it('CMP-42: começar o teste não manda versão, e a competição nasce na version 1', async () => {
    const t = setup();
    const res = await t.service.startTrial(OWNER, GROUP_ID);
    expect(res.version).toBe(1);
  });

  it('CMP-42: o contrato do PUT rules exige a version (inteiro ≥ 0) junto com o regulamento', () => {
    expect(UpdateCompetitionRulesInputSchema.safeParse(CUSTOM).success).toBe(false);
    expect(UpdateCompetitionRulesInputSchema.safeParse({ ...CUSTOM, version: -1 }).success).toBe(false);
    expect(UpdateCompetitionRulesInputSchema.safeParse({ ...CUSTOM, version: 1 }).success).toBe(true);
  });
});
