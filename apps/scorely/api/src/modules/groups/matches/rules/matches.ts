// Criar e editar, iniciar e finalizar (PAR-01–07, 41–43), com as ondas da lista (PAR-03–05) que todos os assuntos leem.
import { newEntity } from '@scorely/api/src/lib/entity';
import { appError } from '@scorely/api/src/lib/errors';
import type { UserId } from '@scorely/api/src/lib/ids';
import { localParts } from '@scorely/api/src/lib/zoned';
import type {
  MatchOpenedAt,
  StoredMatch,
  StoredSeries,
} from '@scorely/api/src/modules/groups/matches/data/matches.repository';
import type { MatchContext } from '@scorely/api/src/modules/groups/matches/matches.service';
import {
  type AdvanceMatchInput,
  type CreateMatchInput,
  type GroupPermission,
  type GroupTier,
  MATCH_LIMITS,
  MATCH_MAX_UPCOMING,
  MATCH_SERIES_MAX_ACTIVE,
  type Match,
  type MatchWave,
  type PublicGroupId,
  TimeZoneSchema,
  type UpdateMatchInput,
} from '@scorely/contracts';
import type { z } from 'zod';

export const HOUR_MS = 3_600_000;

const DAY_MS = 24 * HOUR_MS;
export const MINUTE_MS = 60_000;
export const MANAGE: GroupPermission = 'matches.manage';

/** A ordem das ondas (PAR-03): cada uma inclui as anteriores. */
const WAVE_ORDER: readonly MatchWave[] = ['members', 'reserves', 'guests'];
export const rank = (wave: MatchWave | undefined) => (wave === undefined ? -1 : WAVE_ORDER.indexOf(wave));

/** A primeira onda de cada participação (PAR-08). */
export const TIER_WAVE: Record<GroupTier, MatchWave> = { member: 'members', reserve: 'reserves' };

const validation = (path: string, message: string) =>
  appError('VALIDATION_ERROR', { issues: [{ code: 'custom', path: [path], message }] });

export const hoursBefore = (match: StoredMatch, hours: number) =>
  new Date(Date.parse(match.startsAt) - hours * HOUR_MS);

/**
 * PAR-03, 04: a hora em que cada onda abre pelo relógio (sem o que foi aberto à mão), e o fechamento. Sem a hora
 * configurada, a onda dos membros abre na criação e as outras junto com a anterior; "sem convidados" não abre.
 */
export function naturalTimes(match: StoredMatch) {
  const members =
    match.membersHours === undefined ? new Date(match.createdAt) : hoursBefore(match, match.membersHours);
  const reserves = match.reservesHours === undefined ? members : hoursBefore(match, match.reservesHours);
  const guests = match.guestsHours === undefined ? reserves : hoursBefore(match, match.guestsHours);
  return {
    members,
    reserves,
    guests: match.noGuests ? undefined : guests,
    close: hoursBefore(match, match.closeHours),
  };
}

/** PAR-03, 06: nenhuma hora da abertura configurada (a lista está aberta a todos por isso). */
const unconfigured = (m: StoredMatch) =>
  m.membersHours === undefined && m.reservesHours === undefined && m.guestsHours === undefined;

/** PAR-02: as vagas; sem formato, sem limite. */
export const slotsOf = (m: Pick<StoredMatch, 'teams' | 'playersPerTeam'>) =>
  m.teams !== undefined && m.playersPerTeam !== undefined
    ? m.teams * m.playersPerTeam
    : Number.POSITIVE_INFINITY;

/** PAR-03, 05: a onda aberta agora: a da hora ou a guardada em `advancedTo`, a maior. */
export function currentWave(match: StoredMatch, now: Date): MatchWave | undefined {
  const times = naturalTimes(match);
  const byTime: MatchWave | undefined =
    times.guests !== undefined && times.guests <= now
      ? 'guests'
      : times.reserves <= now
        ? 'reserves'
        : times.members <= now
          ? 'members'
          : undefined;
  return rank(match.advancedTo) > rank(byTime) ? match.advancedTo : byTime;
}

/** PAR-16: a hora que a onda mostra: a configurada ou, se abriu antes dela, a guardada no `openedAt`. */
export function shownTime(match: StoredMatch, wave: MatchWave): Date | undefined {
  const natural = naturalTimes(match)[wave];
  const opened = match.openedAt?.[wave];
  if (opened === undefined) return natural;
  const openedTime = new Date(opened);
  return natural === undefined || openedTime < natural ? openedTime : natural;
}

/**
 * PAR-05, 06, 16: o `openedAt` de `next`. Cada onda até o `advancedTo` dele guarda a hora em que abriu de fato (a
 * que mostrava em `before`, ou `at`, quando abre agora), se ela for antes da hora configurada em `next`. As horas
 * que já existiam não mudam; as das ondas acima do `advancedTo` saem.
 */
function openedAtFor(before: StoredMatch, next: StoredMatch, at: Date): MatchOpenedAt {
  const natural = naturalTimes(next);
  return Object.fromEntries(
    WAVE_ORDER.filter((wave) => rank(wave) <= rank(next.advancedTo)).flatMap((wave) => {
      const kept = before.openedAt?.[wave];
      if (kept !== undefined) return [[wave, kept]];
      const previous = shownTime(before, wave);
      const shown = previous === undefined || previous > at ? at : previous;
      const configured = natural[wave];
      return configured !== undefined && configured <= shown ? [] : [[wave, shown.toISOString()]];
    }),
  );
}

/** VALIDATION_ERROR com os issues do Zod, para a entrada que o service confere de novo. */
export function parseOrFail<T>(schema: z.ZodType<T>, input: unknown): T {
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

/** PAR-01, 06: o início no futuro, até 90 dias. O resto o contrato já conferiu. */
function checkStart(input: Pick<CreateMatchInput, 'startsAt'>, at: Date): void {
  const start = Date.parse(input.startsAt);
  if (start <= at.getTime() || start > at.getTime() + MATCH_LIMITS.startMaxDays * DAY_MS) {
    throw validation('startsAt', 'Start must be in the future, up to 90 days');
  }
}

const timesOf = (input: CreateMatchInput) => ({
  startsAt: new Date(input.startsAt).toISOString(),
  endsAt: new Date(input.endsAt).toISOString(),
});

const fieldsOf = (input: UpdateMatchInput) => ({
  ...timesOf(input),
  teams: input.teams,
  playersPerTeam: input.playersPerTeam,
  membersHours: input.membersHours,
  reservesHours: input.reservesHours,
  guestsHours: input.guestsHours,
  noGuests: input.noGuests,
  closeHours: input.closeHours,
  resultMode: input.resultMode,
});

export function matchesRules(ctx: MatchContext) {
  const { deps, now } = ctx;

  /** PAR-01–04: só o início e o fim; a partida nasce limpa (sem formato, lista aberta a todos, fecha no início). */
  async function create(userId: UserId, publicId: PublicGroupId, input: CreateMatchInput): Promise<Match> {
    const access = await deps.groups.access(userId, publicId);
    ctx.requireManage(access);
    const at = now();
    checkStart(input, at);
    const timeZone = input.repeatWeekly === true ? TimeZoneSchema.safeParse(input.timeZone) : undefined;
    if (timeZone !== undefined && !timeZone.success) throw validation('timeZone', 'Invalid time zone');
    const upcoming = await deps.matches.listMatches(access.groupId, at);
    // PAR-01: contam as que não foram finalizadas nem canceladas.
    if (upcoming.filter((m) => m.cancelledAt === undefined).length >= MATCH_MAX_UPCOMING)
      throw appError('MATCH_LIMIT', { limit: MATCH_MAX_UPCOMING });
    if (timeZone !== undefined) {
      const active = (await deps.matches.listSeries(access.groupId)).filter((x) => x.endedAt === undefined);
      if (active.length >= MATCH_SERIES_MAX_ACTIVE) {
        throw appError('MATCH_SERIES_LIMIT', { limit: MATCH_SERIES_MAX_ACTIVE });
      }
    }
    const times = timesOf(input);
    const local =
      timeZone?.data !== undefined ? localParts(new Date(times.startsAt), timeZone.data) : undefined;
    // PAR-20: a repetição nasce antes (`newEntity`), para a partida levar o id dela; a próxima entra logo abaixo.
    const seriesBase =
      local !== undefined && timeZone?.data !== undefined
        ? newEntity<Omit<StoredSeries, 'updatedAt' | 'currentMatchId'>>(
            {
              groupId: access.groupId,
              version: 1,
              weekday: local.weekday,
              time: local.time,
              durationMinutes: Math.round(
                (Date.parse(times.endsAt) - Date.parse(times.startsAt)) / MINUTE_MS,
              ),
              timeZone: timeZone.data,
              noGuests: false,
              closeHours: 0,
              resultMode: 'day',
              currentDate: local.date,
              createdBy: userId,
            },
            at,
          )
        : undefined;
    const seriesId = seriesBase?.id;
    const entity = newEntity<Omit<StoredMatch, 'updatedAt'>>(
      {
        groupId: access.groupId,
        ...times,
        noGuests: false,
        closeHours: 0,
        resultMode: 'day',
        ...(seriesId !== undefined &&
          seriesBase !== undefined && { seriesId, seriesDate: seriesBase.currentDate }),
        createdBy: userId,
        version: 1,
      },
      at,
    );
    // PAR-24: a partida criada por uma pessoa não avisa ao nascer: as ondas abertas na criação contam como avisadas.
    const draft: StoredMatch = { ...entity, updatedAt: entity.createdAt };
    const match: StoredMatch = { ...draft, notifiedWave: currentWave(draft, at) };
    const series: StoredSeries | undefined =
      seriesBase !== undefined
        ? { ...seriesBase, updatedAt: seriesBase.createdAt, currentMatchId: match.id }
        : undefined;
    await deps.matches.createMatch(match, {
      ...(series !== undefined && { series }),
      agenda: ctx.agendaFor(match, access, at),
    });
    return ctx.view(access, userId, match, true);
  }

  /** PAR-06. */
  async function update(
    userId: UserId,
    publicId: PublicGroupId,
    matchId: string,
    input: UpdateMatchInput,
  ): Promise<Match> {
    const access = await deps.groups.access(userId, publicId);
    ctx.requireManage(access);
    const match = await ctx.load(access.groupId, matchId);
    const at = now();
    ctx.requireLive(match);
    checkStart(input, at);
    const before = await ctx.stateOf(match, true);
    if (slotsOf(input) < before.list.in.length) {
      throw appError('MATCH_SLOTS_BELOW_CONFIRMED', { confirmed: before.list.in.length });
    }
    // A onda aberta agora fica guardada: a edição nunca faz a onda voltar (PAR-05, 06). A lista aberta só por não ter
    // abertura configurada não conta: a primeira configuração passa a valer (PAR-06).
    const openNow = unconfigured(match) ? match.advancedTo : currentWave(match, at);
    const draft: StoredMatch = { ...match, ...fieldsOf(input), advancedTo: match.advancedTo };
    const advancedTo = rank(openNow) > rank(currentWave(draft, at)) ? openNow : match.advancedTo;
    // PAR-16: cada onda que o `advancedTo` segura aberta guarda a hora que já mostrava.
    const next: StoredMatch = {
      ...draft,
      advancedTo,
      openedAt: openedAtFor(match, { ...draft, advancedTo }, at),
    };
    // PAR-24: a primeira configuração faz a onda que voltou a esperar avisar de novo quando abrir.
    const firstSetup = unconfigured(match) && !unconfigured(next);
    // PAR-21, 24: a agenda vai na mesma transação da partida (o `agendaFor` só usa o que a edição define).
    const saved = await deps.matches.updateMatch(
      { ...next, notifiedWave: firstSetup ? currentWave(next, at) : match.notifiedWave },
      input.expectedVersion,
      at,
      { resetNotified: firstSetup, agenda: ctx.agendaFor(next, access, at), previousEndsAt: match.endsAt },
    );
    const after = ctx.lineup(saved, before.attendances, before.guests, before.participants);
    await ctx.notifyPromoted(access, saved, before.list, after);
    await ctx.checkListOpen(saved, access, at);
    return ctx.view(access, userId, await ctx.load(access.groupId, matchId, true), true);
  }

  /** PAR-05. */
  async function advance(
    userId: UserId,
    publicId: PublicGroupId,
    matchId: string,
    input: AdvanceMatchInput,
  ): Promise<Match> {
    const access = await deps.groups.access(userId, publicId);
    ctx.requireManage(access);
    const match = await ctx.load(access.groupId, matchId);
    const at = now();
    if (match.cancelledAt !== undefined) throw appError('MATCH_CANCELLED');
    if (match.startedAt !== undefined) throw appError('MATCH_STARTED');
    if (at >= naturalTimes(match).close) throw appError('MATCH_CLOSED');
    if (rank(input.wave) > rank(currentWave(match, at))) {
      // PAR-16: as ondas que abrem agora guardam a hora do pedido.
      const openedAt = openedAtFor(match, { ...match, advancedTo: input.wave }, at);
      await deps.matches.advanceMatch(access.groupId, matchId, input.wave, openedAt, at);
    }
    // PAR-05, 24: abrir à mão avisa na hora.
    await ctx.checkListOpen(await ctx.load(access.groupId, matchId, true), access, at);
    return ctx.view(access, userId, await ctx.load(access.groupId, matchId, true), true);
  }

  /** PAR-07. */
  async function cancel(userId: UserId, publicId: PublicGroupId, matchId: string): Promise<Match> {
    const access = await deps.groups.access(userId, publicId);
    ctx.requireManage(access);
    const match = await ctx.load(access.groupId, matchId);
    if (match.cancelledAt !== undefined) return ctx.view(access, userId, match);
    const at = now();
    if (match.startedAt !== undefined) throw appError('MATCH_STARTED');
    const state = await ctx.stateOf(match, true);
    // PAR-21: cancelar a partida de uma repetição cria a seguinte na mesma gravação.
    const next = await ctx.nextOf(match, access, at);
    const done = await deps.matches.cancelMatch(access.groupId, matchId, at, next);
    if (done) {
      await ctx.afterNext(next, access, at);
      const people = [...state.list.in, ...state.list.queue].flatMap((i) =>
        i.kind === 'player' && i.userId !== userId ? [i.userId] : [],
      );
      await Promise.all(
        people.map((u) =>
          deps.notifications.notify(u, {
            type: 'match_cancelled',
            title: 'Partida cancelada',
            body: `A partida de ${access.name} foi cancelada.`,
            link: ctx.linkOf(access, matchId),
          }),
        ),
      );
    }
    return ctx.view(access, userId, await ctx.load(access.groupId, matchId, true), true);
  }

  /** PAR-41: iniciar à mão, a qualquer hora. Ninguém é avisado. */
  async function start(userId: UserId, publicId: PublicGroupId, matchId: string): Promise<Match> {
    const access = await deps.groups.access(userId, publicId);
    ctx.requireManage(access);
    const match = await ctx.load(access.groupId, matchId);
    if (match.cancelledAt !== undefined) throw appError('MATCH_CANCELLED');
    if (match.finishedAt !== undefined) throw appError('MATCH_FINISHED');
    if (match.startedAt === undefined) {
      await deps.matches.startMatch(access.groupId, matchId, userId, now());
    }
    return ctx.view(access, userId, await ctx.load(access.groupId, matchId, true), true);
  }

  /** PAR-42: voltar para a lista, antes de finalizar e sem resultado. */
  async function unstart(userId: UserId, publicId: PublicGroupId, matchId: string): Promise<Match> {
    const access = await deps.groups.access(userId, publicId);
    ctx.requireManage(access);
    const match = await ctx.load(access.groupId, matchId);
    if (match.cancelledAt !== undefined) throw appError('MATCH_CANCELLED');
    if (match.finishedAt !== undefined) throw appError('MATCH_FINISHED');
    if (match.startedAt !== undefined) {
      if ((await deps.matches.getResult(access.groupId, matchId, { consistent: true })) !== undefined) {
        throw appError('MATCH_HAS_RESULT');
      }
      const done = await deps.matches.unstartMatch(access.groupId, matchId, now());
      // Um resultado ou a finalização chegou entre a leitura e a gravação.
      if (!done) throw appError('MATCH_HAS_RESULT');
    }
    return ctx.view(access, userId, await ctx.load(access.groupId, matchId, true), true);
  }

  /** PAR-43: finalizar à mão; não se desfaz. Numa repetição, a seguinte nasce na mesma gravação (PAR-21). */
  async function finish(userId: UserId, publicId: PublicGroupId, matchId: string): Promise<Match> {
    const access = await deps.groups.access(userId, publicId);
    ctx.requireManage(access);
    const match = await ctx.load(access.groupId, matchId);
    if (match.cancelledAt !== undefined) throw appError('MATCH_CANCELLED');
    if (match.startedAt === undefined) throw appError('MATCH_NOT_STARTED');
    if (match.finishedAt === undefined) {
      const at = now();
      const next = await ctx.nextOf(match, access, at);
      const done = await deps.matches.finishMatch(access.groupId, matchId, userId, at, next);
      if (done) await ctx.afterNext(next, access, at);
    }
    return ctx.view(access, userId, await ctx.load(access.groupId, matchId, true), true);
  }

  return { create, update, advance, cancel, start, unstart, finish };
}
