import { newEntity } from '@scorely/api/src/lib/entity';
import { appError } from '@scorely/api/src/lib/errors';
import { range } from '@scorely/api/src/lib/fn';
import type { GroupId, UserId } from '@scorely/api/src/lib/ids';
import { localParts } from '@scorely/api/src/lib/zoned';
import type { CompetitionContext } from '@scorely/api/src/modules/groups/competitions/competitions.service';
import type {
  StoredCompetition,
  StoredFinal,
  TaggedItem,
} from '@scorely/api/src/modules/groups/competitions/data/competitions.repository';
import {
  type CountingRules,
  competitionStatus,
  daysBetween,
  lockAtOf,
  startsWithin,
} from '@scorely/api/src/modules/groups/competitions/rules/counting';
import type { RankingRules } from '@scorely/api/src/modules/groups/competitions/rules/ranking';
import type {
  StoredMatch,
  StoredSeries,
} from '@scorely/api/src/modules/groups/matches/data/matches.repository';
import {
  COMPETITION_LIMITS,
  COMPETITION_MAX_OPEN,
  type Competition,
  type CompetitionCut,
  type CompetitionList,
  type CreateCompetitionInput,
  CreateCompetitionInputSchema,
  type PublicGroupId,
  TimeZoneSchema,
  type UpdateCompetitionInput,
  UpdateCompetitionInputSchema,
} from '@scorely/contracts';
import type { z } from 'zod';

// Criar, editar e encerrar a competição (COM-01–04, 07, 08, 10, 11).

const DAY_MS = 86_400_000;
/** COM-11: a rotina olha os itens da trava dos últimos 31 dias (a leitura trava os que ficarem para trás). */
const LOCK_LOOKBACK_MS = 31 * DAY_MS;
/** Tentativas de gravar a criação quando outro gravou antes (o contador ou uma repetição mudou). */
const CREATE_ATTEMPTS = 3;

const validation = (path: string, message: string) =>
  appError('VALIDATION_ERROR', { issues: [{ code: 'custom', path: [path], message }] });

/** VALIDATION_ERROR com os issues do Zod, para a entrada que o service confere de novo. */
function parseOrFail<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  throw appError('VALIDATION_ERROR', {
    issues: parsed.error.issues.map((i) => ({
      code: i.code,
      path: i.path.map((p) => (typeof p === 'number' ? p : String(p))),
      message: i.message,
    })),
  });
}

/** COM-02, 04: de 7 a 366 dias contando os dois extremos, e o fim não fica antes de hoje. */
function checkEnd(startDate: string, endDate: string, today: string): void {
  const days = daysBetween(startDate, endDate) + 1;
  const { min, max } = COMPETITION_LIMITS.durationDays;
  if (days < min || days > max || endDate < today) {
    throw validation('endDate', 'The season must last 7 to 366 days and not end before today');
  }
}

export function createCompetitionRules(
  { deps, now, repo, requireManage, load }: CompetitionContext,
  { results }: CountingRules,
  { liveCuts, standings, profiles, summaryOf, view }: RankingRules,
) {
  /** COM-11: passou do prazo e não travou: trava agora (a rotina ou a leitura, quem vier antes). */
  async function settle(c: StoredCompetition, at: Date): Promise<StoredCompetition> {
    if (c.lockedAt !== undefined || competitionStatus(c, at) !== 'locked') return c;
    const final: StoredFinal = {
      groupId: c.groupId,
      competitionId: c.id,
      cuts: await liveCuts(c, await results(c)),
      createdAt: at.toISOString(),
    };
    await repo.lockCompetition({ competition: c, final, at });
    return load(c.groupId, c.id, true);
  }

  /** As linhas de agora (aberta ou no prazo) ou as guardadas (travada), e se algum resultado soma (COM-04). */

  /** COM-01: a repetição ativa e a próxima partida dela, se começa no período. */
  async function seriesTargets(groupId: GroupId, ids: readonly string[]) {
    return Promise.all(
      ids.map(async (id) => {
        const series = await deps.matches.getSeries(groupId, id, { consistent: true });
        if (!series) throw appError('MATCH_SERIES_NOT_FOUND');
        if (series.endedAt !== undefined) throw appError('MATCH_SERIES_ENDED');
        const match = await deps.matches.getMatch(groupId, series.currentMatchId, { consistent: true });
        return { series, match };
      }),
    );
  }

  /** O "Vale para" com a competição nova; as travadas saem para caber no limite (PAR-40). */
  const tag = <T extends { competitionIds?: string[] | undefined; version: number }>(
    item: T,
    open: ReadonlySet<string>,
    id: string,
  ): TaggedItem<T> => ({
    item,
    competitionIds: [...(item.competitionIds ?? []).filter((x) => open.has(x) && x !== id), id],
    expectedVersion: item.version,
  });

  /** COM-01–03. */
  async function create(
    userId: UserId,
    publicId: PublicGroupId,
    input: CreateCompetitionInput,
  ): Promise<Competition> {
    const ctx = await deps.groups.access(userId, publicId);
    requireManage(ctx);
    const body = parseOrFail(CreateCompetitionInputSchema, input);
    const timeZone = TimeZoneSchema.parse(body.timeZone);
    const at = now();
    const startDate = localParts(at, timeZone).date;
    checkEnd(startDate, body.endDate, startDate);
    const settled = await Promise.all((await repo.listCompetitions(ctx.groupId)).map((c) => settle(c, at)));
    const open = settled.filter((c) => competitionStatus(c, at) !== 'locked');
    if (open.length >= COMPETITION_MAX_OPEN) {
      throw appError('COMPETITION_LIMIT', { limit: COMPETITION_MAX_OPEN });
    }
    const openIds = new Set(open.map((c) => c.id));

    // Outra criação pegou o mesmo número: relê a sequência e tenta de novo.
    for (const _ of range(CREATE_ATTEMPTS)) {
      const [previousNumber, targets] = await Promise.all([
        repo.getSequence(ctx.groupId),
        seriesTargets(ctx.groupId, body.seriesIds),
      ]);
      const entity = newEntity<Omit<StoredCompetition, 'updatedAt'>>(
        {
          groupId: ctx.groupId,
          type: body.type,
          ...(body.name !== undefined && { name: body.name }),
          number: previousNumber + 1,
          startDate,
          endDate: body.endDate,
          timeZone,
          points: body.points,
          createdBy: userId,
          version: 1,
        },
        at,
      );
      const competition: StoredCompetition = { ...entity, updatedAt: entity.createdAt };
      const series: TaggedItem<StoredSeries>[] = targets.map((t) => tag(t.series, openIds, competition.id));
      const matches: TaggedItem<StoredMatch>[] = targets.flatMap(({ match }) =>
        match !== undefined && match.cancelledAt === undefined && startsWithin(competition, match.startsAt)
          ? [tag(match, openIds, competition.id)]
          : [],
      );
      const ok = await repo.createCompetition({
        competition,
        previousNumber,
        lockAt: lockAtOf(competition).toISOString(),
        series,
        matches,
      });
      if (ok) return view(ctx, userId, competition, 'all');
    }
    throw new Error('Competition create kept conflicting');
  }

  /** COM-07: abertas e no prazo pelo fim; depois as travadas, da mais recente para a mais antiga. */
  async function list(userId: UserId, publicId: PublicGroupId): Promise<CompetitionList> {
    const ctx = await deps.groups.access(userId, publicId);
    const at = now();
    const all = await Promise.all((await repo.listCompetitions(ctx.groupId)).map((c) => settle(c, at)));
    const withCuts = await Promise.all(all.map(async (c) => ({ c, all: (await standings(c)).cuts.all })));
    const people = await profiles(withCuts.flatMap((x) => x.all.slice(0, 3)));
    const locked = (c: StoredCompetition) => competitionStatus(c, at) === 'locked';
    const sorted = [...withCuts].sort((x, y) => {
      if (locked(x.c) !== locked(y.c)) return locked(x.c) ? 1 : -1;
      const order = x.c.endDate.localeCompare(y.c.endDate);
      return locked(x.c) ? -order || y.c.number - x.c.number : order || x.c.number - y.c.number;
    });
    return { items: sorted.map((x) => summaryOf(x.c, x.all, people, userId, at)) };
  }

  /** COM-08. */
  async function get(
    userId: UserId,
    publicId: PublicGroupId,
    id: string,
    cut: CompetitionCut,
  ): Promise<Competition> {
    const ctx = await deps.groups.access(userId, publicId);
    const c = await settle(await load(ctx.groupId, id), now());
    return view(ctx, userId, c, cut);
  }

  /** Grava a competição com o fim novo, trocando o item da agenda da trava (COM-04, 10). */
  async function save(c: StoredCompetition, next: StoredCompetition, expectedVersion: number, at: Date) {
    return repo.updateCompetition(next, expectedVersion, at, {
      lockAt: lockAtOf(next).toISOString(),
      previousLockAt: lockAtOf(c).toISOString(),
    });
  }

  /** COM-04. */
  async function update(
    userId: UserId,
    publicId: PublicGroupId,
    id: string,
    input: UpdateCompetitionInput,
  ): Promise<Competition> {
    const ctx = await deps.groups.access(userId, publicId);
    requireManage(ctx);
    const body = parseOrFail(UpdateCompetitionInputSchema, input);
    const at = now();
    const c = await settle(await load(ctx.groupId, id), at);
    const status = competitionStatus(c, at);
    if (status === 'locked') throw appError('COMPETITION_LOCKED');
    const pointsChanged = (['win', 'draw', 'loss'] as const).some((k) => body.points[k] !== c.points[k]);
    if (status === 'grace') {
      // COM-11: no prazo só o nome muda; o fim e os pontos vêm como estão.
      if (body.endDate !== c.endDate)
        throw validation('endDate', 'Only the name changes in the grace period');
      if (pointsChanged) throw validation('points', 'Only the name changes in the grace period');
    } else {
      checkEnd(c.startDate, body.endDate, localParts(at, c.timeZone).date);
      if (pointsChanged && (await results(c)).length > 0) throw appError('COMPETITION_HAS_RESULTS');
    }
    const { name: _n, ...rest } = c;
    const next: StoredCompetition = {
      ...rest,
      ...(body.name !== undefined && { name: body.name }),
      endDate: body.endDate,
      points: body.points,
    };
    const saved = await save(c, next, body.expectedVersion, at);
    return view(ctx, userId, saved, 'all');
  }

  /** COM-10: o fim passa a ser hoje; uma que já passou do fim não muda. */
  async function close(userId: UserId, publicId: PublicGroupId, id: string): Promise<Competition> {
    const ctx = await deps.groups.access(userId, publicId);
    requireManage(ctx);
    const at = now();
    const c = await settle(await load(ctx.groupId, id), at);
    if (competitionStatus(c, at) === 'locked') throw appError('COMPETITION_LOCKED');
    const today = localParts(at, c.timeZone).date;
    if (today >= c.endDate) return view(ctx, userId, c, 'all');
    const saved = await save(c, { ...c, endDate: today }, c.version, at);
    return view(ctx, userId, saved, 'all');
  }

  /**
   * A rotina da trava (COM-11, ADR 0012): lê a agenda da trava dos últimos 31 dias até agora, trava cada competição
   * que passou do prazo e apaga o item. O item velho (o fim mudou) só é apagado. Um item que falha é logado e fica.
   */
  async function runLock(): Promise<void> {
    const at = now();
    const entries = await repo.listLockEntries(new Date(at.getTime() - LOCK_LOOKBACK_MS), at);
    for (const entry of entries) {
      try {
        const c = await repo.getCompetition(entry.groupId, entry.competitionId, { consistent: true });
        if (c !== undefined) await settle(c, at);
        await repo.deleteLockEntry(entry);
      } catch (error) {
        console.error(
          JSON.stringify({
            message: 'Competition lock failed',
            groupId: entry.groupId,
            competitionId: entry.competitionId,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    }
  }

  return { create, list, get, update, close, runLock };
}
