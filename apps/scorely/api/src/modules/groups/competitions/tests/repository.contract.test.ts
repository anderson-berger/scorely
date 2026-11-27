import { randomUUID } from 'node:crypto';
import { asGroupId, asUserId, type GroupId } from '@scorely/api/src/lib/ids';
import { memoryCompetitions } from '@scorely/api/src/modules/groups/competitions/data/competitions.memory';
import {
  type CompetitionRepository,
  dynamoCompetitionRepository,
  type StoredCompetition,
  type StoredFinal,
} from '@scorely/api/src/modules/groups/competitions/data/competitions.repository';
import { memoryMatches } from '@scorely/api/src/modules/groups/matches/data/matches.memory';
import {
  dynamoMatchRepository,
  type MatchRepository,
  type StoredMatch,
  type StoredSeries,
} from '@scorely/api/src/modules/groups/matches/data/matches.repository';
import { beforeAll, describe, expect, inject, it } from 'vitest';

// Suíte de contrato do CompetitionRepository (ADR 0019): a mesma bateria contra a memória e contra o DynamoDB Local.
// Ids sempre novos, sem limpar entre os testes. Regras: competicao.md, seção 3 (COM-01, 02, 04, 05, 10, 11; PAR-40).

const T0 = new Date('2026-11-25T15:00:00.000Z');
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);
const newGroup = (): GroupId => asGroupId(randomUUID());
const USER = asUserId(randomUUID());
const read = { consistent: true };
const LOCK_AT = '2027-01-04T03:00:00.000Z';

function newCompetition(groupId: GroupId, overrides: Partial<StoredCompetition> = {}): StoredCompetition {
  return {
    id: randomUUID(),
    groupId,
    createdAt: T0.toISOString(),
    updatedAt: T0.toISOString(),
    version: 1,
    type: 'season',
    number: 1,
    startDate: '2026-11-25',
    endDate: '2026-12-31',
    timeZone: 'America/Sao_Paulo',
    points: { win: 3, draw: 1, loss: 0 },
    createdBy: USER,
    ...overrides,
  };
}

function newMatch(groupId: GroupId, overrides: Partial<StoredMatch> = {}): StoredMatch {
  return {
    id: randomUUID(),
    groupId,
    createdAt: T0.toISOString(),
    updatedAt: T0.toISOString(),
    version: 1,
    startsAt: '2026-11-27T22:00:00.000Z',
    endsAt: '2026-11-28T00:00:00.000Z',
    noGuests: false,
    closeHours: 0,
    resultMode: 'day',
    createdBy: USER,
    ...overrides,
  };
}

function newSeries(match: StoredMatch): StoredSeries {
  return {
    id: randomUUID(),
    groupId: match.groupId,
    createdAt: T0.toISOString(),
    updatedAt: T0.toISOString(),
    version: 1,
    weekday: 5,
    time: '19:00',
    durationMinutes: 120,
    timeZone: 'America/Sao_Paulo',
    noGuests: false,
    closeHours: 0,
    resultMode: 'day',
    currentMatchId: match.id,
    currentDate: '2026-11-27',
    createdBy: USER,
  };
}

const create = (repo: CompetitionRepository, competition: StoredCompetition, previousNumber = 0) =>
  repo.createCompetition({ competition, previousNumber, lockAt: LOCK_AT, series: [], matches: [] });

describe.each([
  {
    name: 'memória',
    make: () => {
      const store = memoryMatches();
      return { matches: store.repo as MatchRepository, competitions: memoryCompetitions(store).repo };
    },
  },
  {
    name: 'DynamoDB Local',
    make: () => ({
      matches: dynamoMatchRepository as MatchRepository,
      competitions: dynamoCompetitionRepository as CompetitionRepository,
    }),
    dynamo: true,
  },
])('CompetitionRepository ($name)', ({ make, dynamo }) => {
  const { matches, competitions: repo } = make();

  beforeAll(() => {
    if (!dynamo) return;
    process.env.TABLE_NAME = inject('dynamoTableName');
    process.env.DYNAMODB_ENDPOINT = inject('dynamoEndpoint');
    process.env.AWS_REGION = 'sa-east-1';
  });

  it('COM-01, 02: createCompetition grava a competição e o contador; getCompetition devolve igual', async () => {
    const c = newCompetition(newGroup());
    expect(await create(repo, c)).toBe(true);
    expect(await repo.getCompetition(c.groupId, c.id, read)).toEqual(c);
    expect(await repo.getSequence(c.groupId)).toBe(1);
    expect(await repo.getCompetition(newGroup(), c.id, read)).toBeUndefined();
  });

  it('COM-02: o contador precisa estar no número esperado; senão nada é gravado', async () => {
    const groupId = newGroup();
    await create(repo, newCompetition(groupId));
    const late = newCompetition(groupId, { number: 2 });
    expect(await create(repo, late, 0)).toBe(false);
    expect(await repo.getCompetition(groupId, late.id, read)).toBeUndefined();
    expect(await create(repo, late, 1)).toBe(true);
    expect(await repo.getSequence(groupId)).toBe(2);
  });

  it('COM-01, PAR-40: grava o Vale para da repetição e da partida junto, cada uma com a version somada', async () => {
    const groupId = newGroup();
    const match = newMatch(groupId);
    const series = newSeries(match);
    await matches.createMatch(match, { series });
    const c = newCompetition(groupId);
    const ok = await repo.createCompetition({
      competition: c,
      previousNumber: 0,
      lockAt: LOCK_AT,
      series: [{ item: series, competitionIds: [c.id], expectedVersion: 1 }],
      matches: [{ item: match, competitionIds: [c.id], expectedVersion: 1 }],
    });
    expect(ok).toBe(true);
    expect(await matches.getSeries(groupId, series.id, read)).toMatchObject({
      competitionIds: [c.id],
      version: 2,
    });
    expect(await matches.getMatch(groupId, match.id, read)).toMatchObject({
      competitionIds: [c.id],
      version: 2,
    });
  });

  it('COM-01: uma repetição em outra version faz a criação inteira falhar', async () => {
    const groupId = newGroup();
    const match = newMatch(groupId);
    const series = newSeries(match);
    await matches.createMatch(match, { series });
    const c = newCompetition(groupId);
    const ok = await repo.createCompetition({
      competition: c,
      previousNumber: 0,
      lockAt: LOCK_AT,
      series: [{ item: series, competitionIds: [c.id], expectedVersion: 7 }],
      matches: [],
    });
    expect(ok).toBe(false);
    expect(await repo.getCompetition(groupId, c.id, read)).toBeUndefined();
    expect(await repo.getSequence(groupId)).toBe(0);
    expect((await matches.getSeries(groupId, series.id, read))?.competitionIds).toBeUndefined();
  });

  it('COM-07: listCompetitions devolve só as do grupo; getCompetitions mantém a ordem e tira as que não existem', async () => {
    const groupId = newGroup();
    const a = newCompetition(groupId);
    const b = newCompetition(groupId, { number: 2 });
    await create(repo, a);
    await create(repo, b, 1);
    await create(repo, newCompetition(newGroup()));
    expect((await repo.listCompetitions(groupId)).map((c) => c.id).sort()).toEqual([a.id, b.id].sort());
    expect((await repo.getCompetitions(groupId, [b.id, randomUUID(), a.id])).map((c) => c.id)).toEqual([
      b.id,
      a.id,
    ]);
  });

  it('COM-04: updateCompetition confere a version, soma 1 e apaga o nome ausente', async () => {
    const c = newCompetition(newGroup(), { name: 'Copa' });
    await create(repo, c);
    const { name: _n, ...rest } = c;
    const lock = { lockAt: LOCK_AT, previousLockAt: LOCK_AT };
    const saved = await repo.updateCompetition({ ...rest, endDate: '2026-12-20' }, 1, at(1), lock);
    expect(saved).toMatchObject({ endDate: '2026-12-20', version: 2, updatedAt: at(1).toISOString() });
    expect(saved.name).toBeUndefined();
    await expect(repo.updateCompetition(c, 1, at(2), lock)).rejects.toMatchObject({
      code: 'VERSION_CONFLICT',
      details: { currentVersion: 2 },
    });
  });

  it('COM-10, 11: mudar o fim troca o item da agenda da trava', async () => {
    const c = newCompetition(newGroup());
    await create(repo, c);
    const newLock = '2026-12-09T03:00:00.000Z';
    await repo.updateCompetition({ ...c, endDate: '2026-12-05' }, 1, at(1), {
      lockAt: newLock,
      previousLockAt: LOCK_AT,
    });
    const mine = async () =>
      (await repo.listLockEntries(new Date('2026-12-01T00:00:00.000Z'), new Date('2027-02-01T00:00:00.000Z')))
        .filter((e) => e.competitionId === c.id)
        .map((e) => e.at);
    expect(await mine()).toEqual([newLock]);
    await repo.deleteLockEntry({ at: newLock, groupId: c.groupId, competitionId: c.id });
    expect(await mine()).toEqual([]);
  });

  it('COM-11: lockCompetition grava o lockedAt e o ranking final uma vez só', async () => {
    const c = newCompetition(newGroup());
    await create(repo, c);
    const final: StoredFinal = {
      groupId: c.groupId,
      competitionId: c.id,
      cuts: {
        all: [{ position: 1, userId: USER, points: 3, played: 1, wins: 1, draws: 0, losses: 0 }],
        male: [],
        female: [],
      },
      createdAt: at(5).toISOString(),
    };
    expect(await repo.lockCompetition({ competition: c, final, at: at(5) })).toBe(true);
    expect(await repo.lockCompetition({ competition: c, final, at: at(6) })).toBe(false);
    expect(await repo.getCompetition(c.groupId, c.id, read)).toMatchObject({ lockedAt: at(5).toISOString() });
    expect((await repo.getFinal(c.groupId, c.id))?.cuts).toEqual(final.cuts);
  });

  it('COM-05: listByEnd devolve as partidas com o fim na faixa, inclusive, com o resultado', async () => {
    const groupId = newGroup();
    const inside = newMatch(groupId, { endsAt: '2026-12-01T00:00:00.000Z' });
    const edge = newMatch(groupId, { endsAt: '2026-12-05T00:00:00.000Z' });
    const after = newMatch(groupId, { endsAt: '2026-12-06T00:00:00.000Z' });
    for (const m of [inside, edge, after]) await matches.createMatch(m);
    await matches.saveResult({
      groupId,
      matchId: inside.id,
      result: { mode: 'day', teams: [[{ kind: 'user', id: USER }], []], winner: 1 },
      by: USER,
      at: at(1),
      expectedVersion: 0,
    });
    const list = await matches.listByEnd(
      groupId,
      new Date('2026-11-30T00:00:00.000Z'),
      new Date('2026-12-05T00:00:00.000Z'),
    );
    expect(list.map((e) => e.match.id)).toEqual([inside.id, edge.id]);
    expect(list[0]?.result?.mode).toBe('day');
    expect(list[1]?.result).toBeUndefined();
  });
});
