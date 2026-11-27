// Repetir toda semana (PAR-20–23): a seguinte nasce ao finalizar ou cancelar; editar e encerrar a repetição.
import { newEntity } from '@scorely/api/src/lib/entity';
import { appError } from '@scorely/api/src/lib/errors';
import type { GroupId, UserId } from '@scorely/api/src/lib/ids';
import { addDays, weekdayOf, zonedToUtc } from '@scorely/api/src/lib/zoned';
import { competitionStatus, startsWithin } from '@scorely/api/src/modules/groups/competitions/rules/counting';
import type {
  NextMatch,
  StoredMatch,
  StoredSeries,
} from '@scorely/api/src/modules/groups/matches/data/matches.repository';
import type { GroupInfo, MatchContext } from '@scorely/api/src/modules/groups/matches/matches.service';
import { MINUTE_MS, parseOrFail } from '@scorely/api/src/modules/groups/matches/rules/matches';
import {
  type CompetitionRef,
  type MatchSeries,
  type PublicGroupId,
  type UpdateMatchSeriesInput,
  UpdateMatchSeriesInputSchema,
} from '@scorely/contracts';

/** O formato, a abertura e o jeito do resultado (PAR-02–04, 31), iguais na partida e na repetição. */
function setupOf(
  source: Pick<
    StoredMatch,
    | 'teams'
    | 'playersPerTeam'
    | 'membersHours'
    | 'reservesHours'
    | 'guestsHours'
    | 'noGuests'
    | 'closeHours'
    | 'resultMode'
  >,
) {
  return {
    teams: source.teams,
    playersPerTeam: source.playersPerTeam,
    membersHours: source.membersHours,
    reservesHours: source.reservesHours,
    guestsHours: source.guestsHours,
    noGuests: source.noGuests,
    closeHours: source.closeHours,
    resultMode: source.resultMode,
  };
}

/** PAR-16: a repetição como vem na partida, com as competições dela (PAR-40). */
export function seriesView(series: StoredSeries, competitions: CompetitionRef[]): MatchSeries {
  return {
    id: series.id,
    weekday: series.weekday,
    time: series.time,
    durationMinutes: series.durationMinutes,
    timeZone: series.timeZone,
    ...(series.teams !== undefined && { teams: series.teams }),
    ...(series.playersPerTeam !== undefined && { playersPerTeam: series.playersPerTeam }),
    ...(series.membersHours !== undefined && { membersHours: series.membersHours }),
    ...(series.reservesHours !== undefined && { reservesHours: series.reservesHours }),
    ...(series.guestsHours !== undefined && { guestsHours: series.guestsHours }),
    noGuests: series.noGuests,
    closeHours: series.closeHours,
    resultMode: series.resultMode,
    ...(series.endedAt !== undefined && { endedAt: series.endedAt }),
    competitions,
    version: series.version,
  };
}

/**
 * PAR-21: o dia da próxima partida: na semana depois do dia previsto da anterior, no dia da semana da repetição; se o
 * início já passou (a rotina ficou parada), na primeira semana em que ele ainda está no futuro.
 */
function nextDate(series: StoredSeries, from: string, at: Date): string {
  const base = addDays(from, 7);
  const date = addDays(base, series.weekday - weekdayOf(base));
  return zonedToUtc(date, series.time, series.timeZone) > at ? date : nextDate(series, date, at);
}

export function seriesRules(ctx: MatchContext) {
  const { deps, now } = ctx;

  /** PAR-21: a seguinte da repetição de `match`, se ele é a partida atual dela e ela segue ativa. */
  async function nextOf(match: StoredMatch, info: GroupInfo, at: Date): Promise<NextMatch | undefined> {
    const series =
      match.seriesId === undefined
        ? undefined
        : await deps.matches.getSeries(match.groupId, match.seriesId, { consistent: true });
    return series === undefined || series.currentMatchId !== match.id
      ? undefined
      : buildNext(series, info, at);
  }

  /**
   * PAR-21: monta a próxima partida da repetição, com o que a repetição tem agora. Na partida nova, o `notifiedWave`
   * fica vazio: as ondas já abertas avisam logo depois (PAR-24).
   */
  async function buildNext(series: StoredSeries, info: GroupInfo, at: Date): Promise<NextMatch | undefined> {
    if (series.endedAt !== undefined) return undefined;
    const date = nextDate(series, series.currentDate, at);
    const startsAt = zonedToUtc(date, series.time, series.timeZone);
    // PAR-21, 40: as competições da repetição que não travaram e cujo período tem o início da partida nova.
    const competitionIds = (await ctx.competitionsOf(series.groupId, series.competitionIds ?? []))
      .filter((c) => competitionStatus(c, at) !== 'locked' && startsWithin(c, startsAt.toISOString()))
      .map((c) => c.id);
    const entity = newEntity<Omit<StoredMatch, 'updatedAt'>>(
      {
        groupId: series.groupId,
        startsAt: startsAt.toISOString(),
        endsAt: new Date(startsAt.getTime() + series.durationMinutes * MINUTE_MS).toISOString(),
        ...setupOf(series),
        ...(competitionIds.length > 0 && { competitionIds }),
        seriesId: series.id,
        seriesDate: date,
        createdBy: series.createdBy,
        version: 1,
      },
      at,
    );
    const match: StoredMatch = { ...entity, updatedAt: entity.createdAt };
    return { match, previousMatchId: series.currentMatchId, agenda: ctx.agendaFor(match, info, at) };
  }

  /** PAR-21: depois de finalizar ou cancelar, a seguinte já nasceu na mesma gravação: as ondas abertas avisam. */
  async function afterNext(next: NextMatch | undefined, info: GroupInfo, at: Date): Promise<void> {
    if (next !== undefined) await ctx.checkListOpen(next.match, info, at);
  }

  async function loadSeries(groupId: GroupId, seriesId: string): Promise<StoredSeries> {
    const series = await deps.matches.getSeries(groupId, seriesId, { consistent: true });
    if (!series) throw appError('MATCH_SERIES_NOT_FOUND');
    return series;
  }

  /** PAR-22: muda a repetição (menos o fuso); vale para as partidas criadas depois. */
  async function updateSeries(
    userId: UserId,
    publicId: PublicGroupId,
    seriesId: string,
    input: UpdateMatchSeriesInput,
  ): Promise<MatchSeries> {
    const access = await deps.groups.access(userId, publicId);
    ctx.requireManage(access);
    const body = parseOrFail(UpdateMatchSeriesInputSchema, input);
    const series = await loadSeries(access.groupId, seriesId);
    if (series.endedAt !== undefined) throw appError('MATCH_SERIES_ENDED');
    const at = now();
    // PAR-22, 40: as competições que entram ou saem existem e não travaram.
    await ctx.checkTouched(access.groupId, series.competitionIds ?? [], body.competitionIds, at);
    const saved = await deps.matches.updateSeries(
      {
        ...series,
        weekday: body.weekday,
        time: body.time,
        durationMinutes: body.durationMinutes,
        ...setupOf(body),
        competitionIds: body.competitionIds,
      },
      body.expectedVersion,
      at,
    );
    return seriesView(
      saved,
      ctx.refsOf(saved.competitionIds, await ctx.competitionsOf(access.groupId, body.competitionIds)),
    );
  }

  /** PAR-16, 40: a repetição na resposta, com as competições dela. */
  async function seriesOut(series: StoredSeries): Promise<MatchSeries> {
    return seriesView(
      series,
      ctx.refsOf(
        series.competitionIds,
        await ctx.competitionsOf(series.groupId, series.competitionIds ?? []),
      ),
    );
  }

  /** PAR-23: encerra a repetição; a próxima, que já existe, continua. Encerrar de novo não muda nada. */
  async function endSeries(userId: UserId, publicId: PublicGroupId, seriesId: string): Promise<MatchSeries> {
    const access = await deps.groups.access(userId, publicId);
    ctx.requireManage(access);
    const series = await loadSeries(access.groupId, seriesId);
    if (series.endedAt !== undefined) return seriesOut(series);
    await deps.matches.endSeries(access.groupId, seriesId, now());
    return seriesOut(await loadSeries(access.groupId, seriesId));
  }

  return { nextOf, afterNext, updateSeries, endSeries };
}
