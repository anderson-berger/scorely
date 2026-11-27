// Confirmar (PAR-08–10) e aviso de lista aberta (PAR-24), com a agenda que a rotina lê (PAR-21, 24).
import { appError } from '@scorely/api/src/lib/errors';
import type { UserId } from '@scorely/api/src/lib/ids';
import type { Participation } from '@scorely/api/src/modules/groups/groups.access';
import type {
  AgendaEntry,
  StoredAttendance,
  StoredGuest,
  StoredMatch,
} from '@scorely/api/src/modules/groups/matches/data/matches.repository';
import type {
  Access,
  GroupInfo,
  MatchContext,
} from '@scorely/api/src/modules/groups/matches/matches.service';
import { guestStatus } from '@scorely/api/src/modules/groups/matches/rules/guests';
import {
  currentWave,
  HOUR_MS,
  hoursBefore,
  naturalTimes,
  rank,
  slotsOf,
  TIER_WAVE,
} from '@scorely/api/src/modules/groups/matches/rules/matches';
import type {
  GroupTier,
  Match,
  MatchWave,
  MyAttendance,
  PublicGroupId,
  SetAttendanceInput,
} from '@scorely/contracts';

/** A rotina lê no máximo as últimas 48 h da agenda (seção 3). */
const AGENDA_LOOKBACK_MS = 48 * HOUR_MS;

export type LineupItem =
  | { kind: 'player'; at: string; id: string; userId: UserId; tier: GroupTier }
  | { kind: 'guest'; at: string; id: string; guest: StoredGuest };

/**
 * PAR-10: as respostas que contam, as de quem participa hoje dadas desde a entrada atual. Quem saiu e voltou começa
 * sem resposta: a de antes de sair fica guardada, mas não aparece como dele.
 */
export function currentAnswers(
  attendances: readonly StoredAttendance[],
  participants: Map<UserId, Participation>,
): StoredAttendance[] {
  return attendances.filter((a) => {
    const joinedAt = participants.get(a.userId)?.joinedAt;
    return joinedAt !== undefined && a.respondedAt >= joinedAt;
  });
}

/**
 * PAR-09, 10: a lista, calculada ao ler. As respostas "vou" de quem ainda participa e os convidados liberados, pela
 * hora de chegada e, no empate, pelo id como texto. As primeiras posições, até as vagas, estão dentro.
 */
export function lineup(
  match: StoredMatch,
  attendances: readonly StoredAttendance[],
  guests: readonly StoredGuest[],
  participants: Map<UserId, Participation>,
) {
  const answers = currentAnswers(attendances, participants);
  const players: LineupItem[] = answers.flatMap((a) => {
    const tier = participants.get(a.userId)?.tier;
    return a.status === 'going' && tier !== undefined
      ? [{ kind: 'player' as const, at: a.respondedAt, id: a.userId, userId: a.userId, tier }]
      : [];
  });
  const approved: LineupItem[] = guests.flatMap((g) =>
    guestStatus(g) === 'approved'
      ? [{ kind: 'guest' as const, at: g.approvedAt as string, id: g.id, guest: g }]
      : [],
  );
  const ordered = [...players, ...approved].sort((a, b) =>
    a.at === b.at ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.at < b.at ? -1 : 1,
  );
  const slots = slotsOf(match);
  const notGoing = answers
    .filter((a) => a.status === 'not_going')
    .sort((a, b) => (a.respondedAt < b.respondedAt ? -1 : a.respondedAt > b.respondedAt ? 1 : 0));
  return { in: ordered.slice(0, slots), queue: ordered.slice(slots), notGoing };
}

export type Lineup = ReturnType<typeof lineup>;

const insideUsers = (list: Lineup) =>
  new Set(list.in.flatMap((item) => (item.kind === 'player' ? [item.userId] : [])));

export function myAttendanceOf(list: Lineup, userId: UserId): MyAttendance | undefined {
  if (list.in.some((i) => i.kind === 'player' && i.userId === userId)) return 'in';
  if (list.queue.some((i) => i.kind === 'player' && i.userId === userId)) return 'queued';
  if (list.notGoing.some((a) => a.userId === userId)) return 'not_going';
  return undefined;
}

/**
 * PAR-24: quem a mudança de onda deixou confirmar e ainda não respondeu: os membros, se a onda deles abriu agora, e as
 * reservas, se a delas abriu. Os convidados não têm conta.
 */
function listOpenRecipients(
  from: MatchWave | undefined,
  to: MatchWave,
  participants: Map<UserId, Participation>,
  attendances: readonly StoredAttendance[],
): UserId[] {
  const answered = new Set(attendances.map((a) => a.userId));
  const opened = (wave: MatchWave) => rank(from) < rank(wave) && rank(wave) <= rank(to);
  return [...participants.entries()].flatMap(([userId, { tier }]) =>
    opened(TIER_WAVE[tier]) && !answered.has(userId) ? [userId] : [],
  );
}

export function attendanceRules(ctx: MatchContext) {
  const { deps, now } = ctx;

  /**
   * PAR-24: se a onda aberta agora é maior que a já avisada, grava a nova com a condição de a avisada não ter mudado e,
   * só se ganhou, avisa quem ela deixou confirmar. A partida cancelada, ou que já começou, não avisa.
   */
  async function checkListOpen(match: StoredMatch, info: GroupInfo, at: Date): Promise<void> {
    if (match.cancelledAt !== undefined || match.startedAt !== undefined) return;
    const wave = currentWave(match, at);
    if (wave === undefined || rank(wave) <= rank(match.notifiedWave)) return;
    const won = await deps.matches.markNotified(match.groupId, match.id, match.notifiedWave, wave);
    if (!won) return;
    const [attendances, participants] = await Promise.all([
      deps.matches.listAttendances(match.groupId, match.id, { consistent: true }),
      deps.groups.participants(match.groupId),
    ]);
    const people = listOpenRecipients(
      match.notifiedWave,
      wave,
      participants,
      currentAnswers(attendances, participants),
    );
    await Promise.all(
      people.map((u) =>
        deps.notifications.notify(u, {
          type: 'match_list_open',
          title: 'Lista aberta',
          body: `A lista da partida de ${info.name} abriu para você.`,
          link: ctx.linkOf(info, match.id),
        }),
      ),
    );
  }

  /**
   * PAR-24: os itens da agenda da partida: um para cada onda configurada que ainda vai abrir. A repetição não tem item
   * de fim: a seguinte nasce ao finalizar ou cancelar (PAR-21).
   */
  function agendaFor(match: StoredMatch, info: GroupInfo, after: Date): AgendaEntry[] {
    const waves = [
      match.membersHours,
      match.reservesHours,
      match.noGuests ? undefined : match.guestsHours,
    ].flatMap((hours) => (hours === undefined ? [] : [hoursBefore(match, hours)]));
    const instants = waves.filter((when) => when > after);
    return [...new Set(instants.map((when) => when.toISOString()))].map((iso) => ({
      at: iso,
      groupId: match.groupId,
      matchId: match.id,
      publicId: info.publicId,
      groupName: info.name,
    }));
  }

  /** PAR-09: quem passou a estar dentro recebe o aviso (o convidado não tem conta). */
  async function notifyPromoted(
    access: Access,
    match: StoredMatch,
    before: Lineup,
    after: Lineup,
    skip?: UserId,
  ): Promise<void> {
    const was = insideUsers(before);
    const promoted = [...insideUsers(after)].filter((u) => !was.has(u) && u !== skip);
    await Promise.all(
      promoted.map((u) =>
        deps.notifications.notify(u, {
          type: 'match_promoted',
          title: 'Você entrou na lista',
          body: `Abriu uma vaga na partida de ${access.name}.`,
          link: ctx.linkOf(access, match.id),
        }),
      ),
    );
  }

  /** PAR-08, 09. */
  async function setAttendance(
    userId: UserId,
    publicId: PublicGroupId,
    matchId: string,
    input: SetAttendanceInput,
  ): Promise<Match> {
    const access = await deps.groups.access(userId, publicId);
    const match = await ctx.load(access.groupId, matchId);
    const at = now();
    ctx.requireLive(match);
    const before = await ctx.stateOf(match, true);
    const current = before.attendances.find((a) => a.userId === userId);
    if (current?.status === input.status) return ctx.view(access, userId, match, true);
    if (input.status === 'going') {
      if (at >= naturalTimes(match).close) throw appError('MATCH_CLOSED');
      const needed = TIER_WAVE[access.tier];
      if (rank(currentWave(match, at)) < rank(needed)) {
        const opensAt = naturalTimes(match)[needed] as Date;
        throw appError('MATCH_NOT_OPEN_FOR_YOU', { opensAt: opensAt.toISOString() });
      }
    }
    await deps.matches.putAttendance({
      groupId: access.groupId,
      matchId,
      userId,
      status: input.status,
      respondedAt: at.toISOString(),
      createdAt: current?.createdAt ?? at.toISOString(),
    });
    const after = await ctx.stateOf(match, true);
    await notifyPromoted(access, match, before.list, after.list, userId);
    return ctx.view(access, userId, match, true);
  }

  /**
   * A rotina `matchesAgenda` (PAR-21, 24): lê a agenda da hora do `lastRunAt` até agora (no máximo 48 h), trata cada
   * item com instante até agora e o apaga. Tratar relê a partida e decide pela verdade dela. Um item que falha é
   * logado e fica na agenda, sem travar os outros: o cursor para no primeiro que falhou, e a próxima execução
   * tenta de novo (até 48 h).
   */
  async function runAgenda(): Promise<void> {
    const at = now();
    const cursor = await deps.matches.getAgendaCursor();
    const floor = at.getTime() - AGENDA_LOOKBACK_MS;
    const from = new Date(Math.max(cursor === undefined ? floor : Date.parse(cursor), floor));
    const entries = await deps.matches.listAgenda(from, at);
    const failed: string[] = [];
    for (const entry of entries) {
      const ok = await runAgendaEntry(entry, at);
      if (!ok) failed.push(entry.at);
    }
    const firstFailed = failed.sort()[0];
    await deps.matches.setAgendaCursor(firstFailed === undefined ? at : new Date(firstFailed));
  }

  async function runAgendaEntry(entry: AgendaEntry, at: Date): Promise<boolean> {
    try {
      await handleAgenda(entry, at);
      await deps.matches.deleteAgenda(entry);
      return true;
    } catch (error) {
      console.error(
        JSON.stringify({
          message: 'Agenda entry failed',
          groupId: entry.groupId,
          matchId: entry.matchId,
          at: entry.at,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return false;
    }
  }

  async function handleAgenda(entry: AgendaEntry, at: Date): Promise<void> {
    const match = await deps.matches.getMatch(entry.groupId, entry.matchId, { consistent: true });
    if (!match) return;
    const info: GroupInfo = { groupId: entry.groupId, publicId: entry.publicId, name: entry.groupName };
    // PAR-21: a partida seguinte nasce ao finalizar ou cancelar; um item de fim que sobrou no banco não faz nada.
    await checkListOpen(match, info, at);
  }

  return { checkListOpen, agendaFor, notifyPromoted, setAttendance, runAgenda };
}
