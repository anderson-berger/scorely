import { newEntity } from '@scorely/api/src/lib/entity';
import { appError } from '@scorely/api/src/lib/errors';
import type { GroupId, UserId } from '@scorely/api/src/lib/ids';
import { addDays, localParts, weekdayOf, zonedToUtc } from '@scorely/api/src/lib/zoned';
import type { GroupAccess } from '@scorely/api/src/modules/groups/group.access';
import { toUser, type UrlOf } from '@scorely/api/src/modules/groups/group.service';
import type {
  AgendaEntry,
  GuestTransition,
  MatchOpenedAt,
  MatchRepository,
  StoredAttendance,
  StoredGuest,
  StoredMatch,
  StoredSeries,
  StoredTeamPlayer,
  StoredTeams,
} from '@scorely/api/src/modules/matches/match.repository';
import { type MediaService, mediaService } from '@scorely/api/src/modules/media/media.service';
import type { NotificationService } from '@scorely/api/src/modules/notifications/notification.service';
import type { UserDirectory } from '@scorely/api/src/modules/users/user.repository';
import {
  type AdvanceMatchInput,
  type CreateMatchInput,
  type GroupPermission,
  type GroupTier,
  MATCH_GUEST_MAX,
  MATCH_LIMITS,
  MATCH_MAX_UPCOMING,
  MATCH_SERIES_MAX_ACTIVE,
  type Match,
  type MatchEntry,
  type MatchGuestStatus,
  type MatchLineup,
  type MatchSeries,
  type MatchStatus,
  type MatchSummary,
  type MatchTeamMember,
  type MatchWave,
  type MatchWaves,
  type MyAttendance,
  type PublicGroupId,
  type RequestMatchGuestInput,
  type SaveMatchTeamsInput,
  SaveMatchTeamsInputSchema,
  type SetAttendanceInput,
  TimeZoneSchema,
  type UpdateMatchInput,
  type UpdateMatchSeriesInput,
  type User,
} from '@scorely/contracts';

export interface MatchesDeps {
  matches: MatchRepository;
  /** Participação, tier e permissão (GRV-15, 17): o grupo não sabe nada das partidas. */
  groups: GroupAccess;
  users: Pick<UserDirectory, 'getMany'>;
  /** Os avisos `match_promoted` (PAR-09), `match_cancelled` (PAR-07), `match_guest_requested` (PAR-12), `match_list_open` (PAR-24) e `match_teams_ready` (PAR-29). */
  notifications: { notify(...args: Parameters<NotificationService['notify']>): Promise<unknown> };
  /** MID-12: só o `urlOf` da mídia. Sem ele, a mídia de produção. */
  media?: Pick<MediaService, 'urlOf'>;
  now?: () => Date;
}

const HOUR_MS = 3_600_000;

const DAY_MS = 24 * HOUR_MS;
const MINUTE_MS = 60_000;
/** A rotina lê no máximo as últimas 48 h da agenda (seção 3). */
const AGENDA_LOOKBACK_MS = 48 * HOUR_MS;
const MANAGE: GroupPermission = 'matches.manage';

/** A ordem das ondas (PAR-03): cada uma inclui as anteriores. */
const WAVE_ORDER: readonly MatchWave[] = ['members', 'reserves', 'guests'];
const rank = (wave: MatchWave | undefined) => (wave === undefined ? -1 : WAVE_ORDER.indexOf(wave));

/** A primeira onda de cada participação (PAR-08). */
const TIER_WAVE: Record<GroupTier, MatchWave> = { member: 'members', reserve: 'reserves' };

const validation = (path: string, message: string) =>
  appError('VALIDATION_ERROR', { issues: [{ code: 'custom', path: [path], message }] });

/** PAR-12: sem maiúsculas, acentos e espaços repetidos, para comparar nomes. */
export function normalizeGuestName(name: string): string {
  return name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** PAR-11: a situação do convidado, calculada dos campos de cada passo. */
export function guestStatus(guest: StoredGuest): MatchGuestStatus {
  if (guest.removedAt !== undefined) return 'removed';
  if (guest.approvedAt !== undefined) return 'approved';
  if (guest.declinedAt !== undefined) return 'declined';
  if (guest.cancelledAt !== undefined) return 'cancelled';
  return 'pending';
}

const at = (match: StoredMatch, hours: number) => new Date(Date.parse(match.startsAt) - hours * HOUR_MS);

/**
 * PAR-03, 04: a hora em que cada onda abre pelo relógio (sem o que foi aberto à mão), e o fechamento. Sem a hora
 * configurada, a onda dos membros abre na criação e as outras junto com a anterior; "sem convidados" não abre.
 */
function naturalTimes(match: StoredMatch) {
  const members =
    match.membersHours === undefined ? new Date(match.createdAt) : at(match, match.membersHours);
  const reserves = match.reservesHours === undefined ? members : at(match, match.reservesHours);
  const guests = match.guestsHours === undefined ? reserves : at(match, match.guestsHours);
  return {
    members,
    reserves,
    guests: match.noGuests ? undefined : guests,
    close: at(match, match.closeHours),
  };
}

/** PAR-03, 06: nenhuma hora da abertura configurada (a lista está aberta a todos por isso). */
const unconfigured = (m: StoredMatch) =>
  m.membersHours === undefined && m.reservesHours === undefined && m.guestsHours === undefined;

/** PAR-02: as vagas; sem formato, sem limite. */
const slotsOf = (m: Pick<StoredMatch, 'teams' | 'playersPerTeam'>) =>
  m.teams !== undefined && m.playersPerTeam !== undefined
    ? m.teams * m.playersPerTeam
    : Number.POSITIVE_INFINITY;

/** PAR-03, 05: a onda aberta agora: a da hora ou a guardada em `advancedTo`, a maior. */
function currentWave(match: StoredMatch, now: Date): MatchWave | undefined {
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
function shownTime(match: StoredMatch, wave: MatchWave): Date | undefined {
  const natural = naturalTimes(match)[wave];
  const opened = match.openedAt?.[wave];
  if (opened === undefined) return natural;
  const openedTime = new Date(opened);
  return natural === undefined || openedTime < natural ? openedTime : natural;
}

/** PAR-16: as horas das ondas, já com a hora em que cada uma abriu antes da hora configurada. */
function wavesView(match: StoredMatch): MatchWaves {
  const guests = shownTime(match, 'guests');
  return {
    members: (shownTime(match, 'members') as Date).toISOString(),
    reserves: (shownTime(match, 'reserves') as Date).toISOString(),
    ...(guests !== undefined && { guests: guests.toISOString() }),
    close: naturalTimes(match).close.toISOString(),
  };
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

/** PAR-16: a situação, calculada pela hora. */
function statusOf(match: StoredMatch, now: Date): MatchStatus {
  if (match.cancelledAt !== undefined) return 'cancelled';
  if (now >= new Date(match.endsAt)) return 'finished';
  if (now >= new Date(match.startsAt)) return 'in_progress';
  if (now >= naturalTimes(match).close) return 'closed';
  return currentWave(match, now) === undefined ? 'scheduled' : 'open';
}

type LineupItem =
  | { kind: 'player'; at: string; id: string; userId: UserId; tier: GroupTier }
  | { kind: 'guest'; at: string; id: string; guest: StoredGuest };

/**
 * PAR-09, 10: a lista, calculada ao ler. As respostas "vou" de quem ainda participa e os convidados liberados, pela
 * hora de chegada e, no empate, pelo id como texto. As primeiras posições, até as vagas, estão dentro.
 */
function lineup(
  match: StoredMatch,
  attendances: readonly StoredAttendance[],
  guests: readonly StoredGuest[],
  participants: Map<UserId, GroupTier>,
) {
  const players: LineupItem[] = attendances.flatMap((a) => {
    const tier = participants.get(a.userId);
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
  const notGoing = attendances
    .filter((a) => a.status === 'not_going' && participants.has(a.userId))
    .sort((a, b) => (a.respondedAt < b.respondedAt ? -1 : a.respondedAt > b.respondedAt ? 1 : 0));
  return { in: ordered.slice(0, slots), queue: ordered.slice(slots), notGoing };
}

type Lineup = ReturnType<typeof lineup>;

const insideUsers = (list: Lineup) =>
  new Set(list.in.flatMap((item) => (item.kind === 'player' ? [item.userId] : [])));

function myAttendanceOf(list: Lineup, userId: UserId): MyAttendance | undefined {
  if (list.in.some((i) => i.kind === 'player' && i.userId === userId)) return 'in';
  if (list.queue.some((i) => i.kind === 'player' && i.userId === userId)) return 'queued';
  if (list.notGoing.some((a) => a.userId === userId)) return 'not_going';
  return undefined;
}

/** PAR-27: de quem os times salvos precisam do perfil: quem tem conta e quem trouxe cada convidado. */
function teamPeople(saved: StoredTeams | undefined, guests: readonly StoredGuest[]): UserId[] {
  const byId = new Map(guests.map((g) => [g.id, g]));
  return (saved?.teams.flat() ?? []).flatMap((p) => {
    if (p.kind === 'user') return [p.id as UserId];
    const guest = byId.get(p.id);
    return guest ? [guest.requestedBy] : [];
  });
}

type Access = Awaited<ReturnType<GroupAccess['access']>>;

/** O que o aviso precisa do grupo: o id público (o link) e o nome. A rotina tira da agenda; a requisição, do acesso. */
type GroupInfo = Pick<Access, 'groupId' | 'publicId' | 'name'>;

/** O formato e a abertura (PAR-02–04), iguais na partida e na repetição. */
function setupOf(
  source: Pick<
    StoredMatch,
    'teams' | 'playersPerTeam' | 'membersHours' | 'reservesHours' | 'guestsHours' | 'noGuests' | 'closeHours'
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
  };
}

/** PAR-16: a repetição como vem na partida. */
function seriesView(series: StoredSeries): MatchSeries {
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
    ...(series.endedAt !== undefined && { endedAt: series.endedAt }),
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

/**
 * PAR-24: quem a mudança de onda deixou confirmar e ainda não respondeu: os membros, se a onda deles abriu agora, e as
 * reservas, se a delas abriu. Os convidados não têm conta.
 */
function listOpenRecipients(
  from: MatchWave | undefined,
  to: MatchWave,
  participants: Map<UserId, GroupTier>,
  attendances: readonly StoredAttendance[],
): UserId[] {
  const answered = new Set(attendances.map((a) => a.userId));
  const opened = (wave: MatchWave) => rank(from) < rank(wave) && rank(wave) <= rank(to);
  return [...participants.entries()].flatMap(([userId, tier]) =>
    opened(TIER_WAVE[tier]) && !answered.has(userId) ? [userId] : [],
  );
}

export function createMatchService(deps: MatchesDeps) {
  const now = deps.now ?? (() => new Date());
  const urlOf: UrlOf = (purpose, mediaId) =>
    deps.media ? deps.media.urlOf(purpose, mediaId) : mediaService.urlOf(purpose, mediaId);

  const canManage = (ctx: Access) => ctx.permissions.includes(MANAGE);

  function requireManage(ctx: Access): void {
    if (!canManage(ctx)) throw appError('GROUP_PERMISSION_DENIED', { permission: MANAGE });
  }

  async function load(groupId: GroupId, matchId: string, consistent = false): Promise<StoredMatch> {
    const match = await deps.matches.getMatch(groupId, matchId, { consistent });
    if (!match) throw appError('MATCH_NOT_FOUND');
    return match;
  }

  /** Respostas, convidados e participantes de uma vez. */
  async function stateOf(match: StoredMatch, consistent = false) {
    const [attendances, guests, participants] = await Promise.all([
      deps.matches.listAttendances(match.groupId, match.id, { consistent }),
      deps.matches.listGuests(match.groupId, match.id, { consistent }),
      deps.groups.participants(match.groupId),
    ]);
    return { attendances, guests, participants, list: lineup(match, attendances, guests, participants) };
  }

  async function profiles(ids: readonly UserId[]): Promise<Map<UserId, User>> {
    const unique = [...new Set(ids)];
    const records = unique.length > 0 ? await deps.users.getMany(unique) : [];
    return new Map(records.map((r) => [r.id, toUser(r, urlOf)]));
  }

  function profileOf(map: Map<UserId, User>, id: UserId): User {
    const user = map.get(id);
    if (!user) throw new Error('Match person without a user profile');
    return user;
  }

  const linkOf = (ctx: Pick<GroupInfo, 'publicId'>, matchId: string) =>
    `/groups/${ctx.publicId}/matches/${matchId}`;

  function summaryOf(
    match: StoredMatch,
    list: Lineup,
    userId: UserId,
    at: Date,
    series?: StoredSeries,
  ): MatchSummary {
    const wave = currentWave(match, at);
    const mine = myAttendanceOf(list, userId);
    const activeSeries = series !== undefined && series.endedAt === undefined ? series : undefined;
    return {
      id: match.id,
      startsAt: match.startsAt,
      endsAt: match.endsAt,
      ...(match.teams !== undefined && { teams: match.teams }),
      ...(match.playersPerTeam !== undefined && { playersPerTeam: match.playersPerTeam }),
      status: statusOf(match, at),
      ...(wave !== undefined && { wave }),
      confirmed: list.in.length,
      ...(mine !== undefined && { myAttendance: mine }),
      ...(activeSeries !== undefined && { seriesWeekday: activeSeries.weekday }),
    };
  }

  /** PAR-16: a partida para quem pede. */
  async function view(ctx: Access, userId: UserId, match: StoredMatch, consistent = false): Promise<Match> {
    const [state, series, saved] = await Promise.all([
      stateOf(match, consistent),
      match.seriesId === undefined
        ? undefined
        : deps.matches.getSeries(match.groupId, match.seriesId, { consistent }),
      deps.matches.getTeams(match.groupId, match.id, { consistent }),
    ]);
    const at = now();
    const manage = canManage(ctx);
    const live = match.cancelledAt === undefined && at < new Date(match.startsAt);
    const open = live && at < naturalTimes(match).close;
    const wave = currentWave(match, at);
    const requests = state.guests.filter(
      (g) => guestStatus(g) === 'pending' && (manage || g.requestedBy === userId),
    );
    const people = await profiles([
      ...[...state.list.in, ...state.list.queue].flatMap((i) =>
        i.kind === 'player' ? [i.userId] : [i.guest.requestedBy],
      ),
      ...state.list.notGoing.map((a) => a.userId),
      ...requests.map((g) => g.requestedBy),
      ...teamPeople(saved, state.guests),
    ]);
    const entry = (item: LineupItem): MatchEntry =>
      item.kind === 'player'
        ? { kind: 'player', user: profileOf(people, item.userId), tier: item.tier }
        : {
            kind: 'guest',
            guestId: item.guest.id,
            name: item.guest.name,
            requestedBy: profileOf(people, item.guest.requestedBy),
            removable: live && (manage || item.guest.requestedBy === userId),
          };
    return {
      ...summaryOf(match, state.list, userId, at, series),
      createdAt: match.createdAt,
      version: match.version,
      ...(match.membersHours !== undefined && { membersHours: match.membersHours }),
      ...(match.reservesHours !== undefined && { reservesHours: match.reservesHours }),
      ...(match.guestsHours !== undefined && { guestsHours: match.guestsHours }),
      noGuests: match.noGuests,
      closeHours: match.closeHours,
      waves: wavesView(match),
      ...(match.cancelledAt !== undefined && { cancelledAt: match.cancelledAt }),
      in: state.list.in.map(entry),
      queue: state.list.queue.map(entry),
      notGoing: state.list.notGoing.map((a) => ({
        user: profileOf(people, a.userId),
        tier: state.participants.get(a.userId) as GroupTier,
      })),
      guestRequests: requests.map((g) => ({
        id: g.id,
        name: g.name,
        requestedBy: profileOf(people, g.requestedBy),
        createdAt: g.createdAt,
        decidable: manage && open && wave === 'guests',
        cancellable: live && g.requestedBy === userId,
      })),
      actions: {
        going: open && rank(wave) >= rank(TIER_WAVE[ctx.tier]),
        notGoing: live,
        requestGuest: open && wave === 'guests',
        manage: manage && live,
        manageTeams: manage && match.cancelledAt === undefined && at < new Date(match.endsAt),
      },
      ...(series !== undefined && { series: seriesView(series) }),
      ...(saved !== undefined && { lineup: lineupView(saved, state, people, entry) }),
    };
  }

  /**
   * PAR-27, 28: os times salvos, cada pessoa com a marca de quem não está mais dentro, e quem está dentro sem time
   * à parte, na ordem da lista. Quem não tem mais perfil (ou o convidado que não existe) fica de fora.
   */
  function lineupView(
    saved: StoredTeams,
    state: Awaited<ReturnType<typeof stateOf>>,
    people: Map<UserId, User>,
    entry: (item: LineupItem) => MatchEntry,
  ): MatchLineup {
    const inside = new Set(state.list.in.map((i) => `${i.kind === 'player' ? 'user' : 'guest'}:${i.id}`));
    const guests = new Map(state.guests.map((g) => [g.id, g]));
    const member = (p: StoredTeamPlayer): MatchTeamMember[] => {
      const left = !inside.has(`${p.kind}:${p.id}`);
      if (p.kind === 'user') {
        const user = people.get(p.id as UserId);
        const tier = state.participants.get(p.id as UserId);
        return user ? [{ kind: 'player', user, ...(tier !== undefined && { tier }), left }] : [];
      }
      const guest = guests.get(p.id);
      const by = guest && people.get(guest.requestedBy);
      return guest && by
        ? [{ kind: 'guest', guestId: guest.id, name: guest.name, requestedBy: by, left }]
        : [];
    };
    const placed = new Set(saved.teams.flat().map((p) => `${p.kind}:${p.id}`));
    return {
      list: saved.teams.map((team) => team.flatMap(member)),
      unassigned: state.list.in
        .filter((i) => !placed.has(`${i.kind === 'player' ? 'user' : 'guest'}:${i.id}`))
        .map(entry),
      version: saved.version,
    };
  }

  /** PAR-25: os times da entrada, com o `UserId` de quem está dentro; quem não está dentro vai em `out`. */
  function resolveTeams(input: SaveMatchTeamsInput, list: Lineup, people: Map<UserId, User>) {
    const users = new Map(
      list.in.flatMap((i) => {
        const user = i.kind === 'player' ? people.get(i.userId) : undefined;
        return i.kind === 'player' && user ? [[user.id as string, i.userId] as const] : [];
      }),
    );
    const guests = new Set(list.in.flatMap((i) => (i.kind === 'guest' ? [i.id] : [])));
    const out = input.teams.flat().filter((p) => (p.kind === 'user' ? !users.has(p.id) : !guests.has(p.id)));
    const teams: StoredTeamPlayer[][] = input.teams.map((team) =>
      team.map((p) => ({ kind: p.kind, id: p.kind === 'user' ? (users.get(p.id) ?? p.id) : p.id })),
    );
    return { teams, out };
  }

  /** PAR-25, 28, 29: salvar os times (troca a divisão inteira). O primeiro salvar avisa quem está num time. */
  async function saveTeams(
    userId: UserId,
    publicId: PublicGroupId,
    matchId: string,
    input: SaveMatchTeamsInput,
  ): Promise<Match> {
    const ctx = await deps.groups.access(userId, publicId);
    requireManage(ctx);
    const match = await load(ctx.groupId, matchId);
    const at = now();
    if (match.cancelledAt !== undefined) throw appError('MATCH_CANCELLED');
    if (at >= new Date(match.endsAt)) throw appError('MATCH_FINISHED');
    const parsed = SaveMatchTeamsInputSchema.safeParse(input);
    if (!parsed.success) {
      throw appError('VALIDATION_ERROR', {
        issues: parsed.error.issues.map((i) => ({
          code: i.code,
          path: i.path.map((p) => (typeof p === 'number' ? p : String(p))),
          message: i.message,
        })),
      });
    }
    const state = await stateOf(match, true);
    const people = await profiles(state.list.in.flatMap((i) => (i.kind === 'player' ? [i.userId] : [])));
    const { teams, out } = resolveTeams(parsed.data, state.list, people);
    if (out.length > 0) throw appError('MATCH_TEAM_PLAYER_OUT', { players: out });
    const result = await deps.matches.saveTeams({
      groupId: ctx.groupId,
      matchId,
      teams,
      by: userId,
      at,
      expectedVersion: parsed.data.expectedVersion,
    });
    if (result.created) {
      const placed = teams
        .flat()
        .flatMap((p) => (p.kind === 'user' && p.id !== userId ? [p.id as UserId] : []));
      await Promise.all(
        placed.map((u) =>
          deps.notifications.notify(u, {
            type: 'match_teams_ready',
            title: 'Times prontos',
            body: `Os times da partida de ${ctx.name} saíram.`,
            link: linkOf(ctx, matchId),
          }),
        ),
      );
    }
    return view(ctx, userId, match, true);
  }

  /**
   * PAR-24: se a onda aberta agora é maior que a já avisada, grava a nova com a condição de a avisada não ter mudado e,
   * só se ganhou, avisa quem ela deixou confirmar. A partida cancelada, ou que já começou, não avisa.
   */
  async function checkListOpen(match: StoredMatch, info: GroupInfo, at: Date): Promise<void> {
    if (match.cancelledAt !== undefined || at >= new Date(match.startsAt)) return;
    const wave = currentWave(match, at);
    if (wave === undefined || rank(wave) <= rank(match.notifiedWave)) return;
    const won = await deps.matches.markNotified(match.groupId, match.id, match.notifiedWave, wave);
    if (!won) return;
    const [attendances, participants] = await Promise.all([
      deps.matches.listAttendances(match.groupId, match.id, { consistent: true }),
      deps.groups.participants(match.groupId),
    ]);
    const people = listOpenRecipients(match.notifiedWave, wave, participants, attendances);
    await Promise.all(
      people.map((u) =>
        deps.notifications.notify(u, {
          type: 'match_list_open',
          title: 'Lista aberta',
          body: `A lista da partida de ${info.name} abriu para você.`,
          link: linkOf(info, match.id),
        }),
      ),
    );
  }

  /**
   * PAR-21, 24: os itens da agenda da partida: um para cada onda configurada que ainda vai abrir e, na partida de uma
   * repetição, um para o fim.
   */
  function agendaFor(match: StoredMatch, info: GroupInfo, after: Date): AgendaEntry[] {
    const waves = [
      match.membersHours,
      match.reservesHours,
      match.noGuests ? undefined : match.guestsHours,
    ].flatMap((hours) => (hours === undefined ? [] : [at(match, hours)]));
    const instants = [
      ...waves.filter((when) => when > after),
      ...(match.seriesId !== undefined ? [new Date(match.endsAt)] : []),
    ];
    return [...new Set(instants.map((when) => when.toISOString()))].map((iso) => ({
      at: iso,
      groupId: match.groupId,
      matchId: match.id,
      publicId: info.publicId,
      groupName: info.name,
    }));
  }

  /**
   * PAR-21: cria a próxima partida da repetição, com o que a repetição tem agora, se ninguém criou antes. Na partida
   * nova, o `notifiedWave` fica vazio: as ondas já abertas avisam logo depois (PAR-24).
   */
  async function rollSeries(series: StoredSeries, info: GroupInfo, at: Date): Promise<void> {
    if (series.endedAt !== undefined) return;
    const date = nextDate(series, series.currentDate, at);
    const startsAt = zonedToUtc(date, series.time, series.timeZone);
    const entity = newEntity<Omit<StoredMatch, 'updatedAt'>>(
      {
        groupId: series.groupId,
        startsAt: startsAt.toISOString(),
        endsAt: new Date(startsAt.getTime() + series.durationMinutes * MINUTE_MS).toISOString(),
        ...setupOf(series),
        seriesId: series.id,
        seriesDate: date,
        createdBy: series.createdBy,
        version: 1,
      },
      at,
    );
    const match: StoredMatch = { ...entity, updatedAt: entity.createdAt };
    const created = await deps.matches.createNextMatch({
      match,
      previousMatchId: series.currentMatchId,
      agenda: agendaFor(match, info, at),
      at,
    });
    if (created) await checkListOpen(match, info, at);
  }

  /** PAR-21: a leitura cria a próxima das repetições ativas cuja partida atual já terminou (não está nas por vir). */
  async function rollEnded(info: GroupInfo, upcoming: readonly StoredMatch[], at: Date) {
    const all = await deps.matches.listSeries(info.groupId);
    const live = new Set(upcoming.map((m) => m.id));
    const ended = all.filter((x) => x.endedAt === undefined && !live.has(x.currentMatchId));
    await Promise.all(ended.map((x) => rollSeries(x, info, at)));
    return { all, rolled: ended.length > 0 };
  }

  /** PAR-09: quem passou a estar dentro recebe o aviso (o convidado não tem conta). */
  async function notifyPromoted(
    ctx: Access,
    match: StoredMatch,
    before: Lineup,
    after: Lineup,
    skip?: UserId,
  ) {
    const was = insideUsers(before);
    const promoted = [...insideUsers(after)].filter((u) => !was.has(u) && u !== skip);
    await Promise.all(
      promoted.map((u) =>
        deps.notifications.notify(u, {
          type: 'match_promoted',
          title: 'Você entrou na lista',
          body: `Abriu uma vaga na partida de ${ctx.name}.`,
          link: linkOf(ctx, match.id),
        }),
      ),
    );
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
  });

  /** PAR-01–04: só o início e o fim; a partida nasce limpa (sem formato, lista aberta a todos, fecha no início). */
  async function create(userId: UserId, publicId: PublicGroupId, input: CreateMatchInput): Promise<Match> {
    const ctx = await deps.groups.access(userId, publicId);
    requireManage(ctx);
    const at = now();
    checkStart(input, at);
    const timeZone = input.repeatWeekly === true ? TimeZoneSchema.safeParse(input.timeZone) : undefined;
    if (timeZone !== undefined && !timeZone.success) throw validation('timeZone', 'Invalid time zone');
    const upcoming = await deps.matches.listMatches(ctx.groupId, at);
    if (upcoming.length >= MATCH_MAX_UPCOMING) throw appError('MATCH_LIMIT', { limit: MATCH_MAX_UPCOMING });
    if (timeZone !== undefined) {
      const active = (await deps.matches.listSeries(ctx.groupId)).filter((x) => x.endedAt === undefined);
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
              groupId: ctx.groupId,
              version: 1,
              weekday: local.weekday,
              time: local.time,
              durationMinutes: Math.round(
                (Date.parse(times.endsAt) - Date.parse(times.startsAt)) / MINUTE_MS,
              ),
              timeZone: timeZone.data,
              noGuests: false,
              closeHours: 0,
              currentDate: local.date,
              createdBy: userId,
            },
            at,
          )
        : undefined;
    const seriesId = seriesBase?.id;
    const entity = newEntity<Omit<StoredMatch, 'updatedAt'>>(
      {
        groupId: ctx.groupId,
        ...times,
        noGuests: false,
        closeHours: 0,
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
      agenda: agendaFor(match, ctx, at),
    });
    return view(ctx, userId, match, true);
  }

  /** PAR-15: as que não terminaram, canceladas incluídas, pelo início. */
  async function list(userId: UserId, publicId: PublicGroupId): Promise<MatchSummary[]> {
    const ctx = await deps.groups.access(userId, publicId);
    const at = now();
    const first = await deps.matches.listMatches(ctx.groupId, at);
    const rolled = await rollEnded(ctx, first, at);
    const matches = rolled.rolled ? await deps.matches.listMatches(ctx.groupId, at) : first;
    const series = new Map(
      (rolled.rolled ? await deps.matches.listSeries(ctx.groupId) : rolled.all).map((x) => [x.id, x]),
    );
    const participants = await deps.groups.participants(ctx.groupId);
    const summaries = await Promise.all(
      matches.map(async (match) => {
        const [attendances, guests] = await Promise.all([
          deps.matches.listAttendances(match.groupId, match.id),
          deps.matches.listGuests(match.groupId, match.id),
        ]);
        const from = match.seriesId === undefined ? undefined : series.get(match.seriesId);
        return summaryOf(match, lineup(match, attendances, guests, participants), userId, at, from);
      }),
    );
    return summaries.sort((a, b) =>
      a.startsAt === b.startsAt ? (a.id < b.id ? -1 : 1) : a.startsAt < b.startsAt ? -1 : 1,
    );
  }

  /** PAR-16. */
  async function get(userId: UserId, publicId: PublicGroupId, matchId: string): Promise<Match> {
    const ctx = await deps.groups.access(userId, publicId);
    const match = await load(ctx.groupId, matchId);
    const at = now();
    if (match.seriesId !== undefined && at >= new Date(match.endsAt)) {
      // PAR-21: a leitura depois do fim cria a próxima, se a rotina ainda não criou.
      const series = await deps.matches.getSeries(ctx.groupId, match.seriesId, { consistent: true });
      if (series !== undefined && series.currentMatchId === match.id) await rollSeries(series, ctx, at);
    }
    return view(ctx, userId, match);
  }

  /** Partida que ainda aceita mudança: não cancelada (PAR-07) e antes do início (PAR-06, 08, 14). */
  function requireLive(match: StoredMatch, at: Date): void {
    if (match.cancelledAt !== undefined) throw appError('MATCH_CANCELLED');
    if (at >= new Date(match.startsAt)) throw appError('MATCH_STARTED');
  }

  /** PAR-06. */
  async function update(
    userId: UserId,
    publicId: PublicGroupId,
    matchId: string,
    input: UpdateMatchInput,
  ): Promise<Match> {
    const ctx = await deps.groups.access(userId, publicId);
    requireManage(ctx);
    const match = await load(ctx.groupId, matchId);
    const at = now();
    requireLive(match, at);
    checkStart(input, at);
    const before = await stateOf(match, true);
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
      { resetNotified: firstSetup, agenda: agendaFor(next, ctx, at) },
    );
    const after = lineup(saved, before.attendances, before.guests, before.participants);
    await notifyPromoted(ctx, saved, before.list, after);
    await checkListOpen(saved, ctx, at);
    return view(ctx, userId, await load(ctx.groupId, matchId, true), true);
  }

  /** PAR-05. */
  async function advance(
    userId: UserId,
    publicId: PublicGroupId,
    matchId: string,
    input: AdvanceMatchInput,
  ): Promise<Match> {
    const ctx = await deps.groups.access(userId, publicId);
    requireManage(ctx);
    const match = await load(ctx.groupId, matchId);
    const at = now();
    if (match.cancelledAt !== undefined) throw appError('MATCH_CANCELLED');
    if (at >= naturalTimes(match).close) throw appError('MATCH_CLOSED');
    if (rank(input.wave) > rank(currentWave(match, at))) {
      // PAR-16: as ondas que abrem agora guardam a hora do pedido.
      const openedAt = openedAtFor(match, { ...match, advancedTo: input.wave }, at);
      await deps.matches.advanceMatch(ctx.groupId, matchId, input.wave, openedAt, at);
    }
    // PAR-05, 24: abrir à mão avisa na hora.
    await checkListOpen(await load(ctx.groupId, matchId, true), ctx, at);
    return view(ctx, userId, await load(ctx.groupId, matchId, true), true);
  }

  /** PAR-07. */
  async function cancel(userId: UserId, publicId: PublicGroupId, matchId: string): Promise<Match> {
    const ctx = await deps.groups.access(userId, publicId);
    requireManage(ctx);
    const match = await load(ctx.groupId, matchId);
    if (match.cancelledAt !== undefined) return view(ctx, userId, match);
    const at = now();
    if (at >= new Date(match.startsAt)) throw appError('MATCH_STARTED');
    const state = await stateOf(match, true);
    const done = await deps.matches.cancelMatch(ctx.groupId, matchId, at);
    if (done) {
      const people = [...state.list.in, ...state.list.queue].flatMap((i) =>
        i.kind === 'player' && i.userId !== userId ? [i.userId] : [],
      );
      await Promise.all(
        people.map((u) =>
          deps.notifications.notify(u, {
            type: 'match_cancelled',
            title: 'Partida cancelada',
            body: `A partida de ${ctx.name} foi cancelada.`,
            link: linkOf(ctx, matchId),
          }),
        ),
      );
    }
    return view(ctx, userId, await load(ctx.groupId, matchId, true), true);
  }

  /** PAR-08, 09. */
  async function setAttendance(
    userId: UserId,
    publicId: PublicGroupId,
    matchId: string,
    input: SetAttendanceInput,
  ): Promise<Match> {
    const ctx = await deps.groups.access(userId, publicId);
    const match = await load(ctx.groupId, matchId);
    const at = now();
    requireLive(match, at);
    const before = await stateOf(match, true);
    const current = before.attendances.find((a) => a.userId === userId);
    if (current?.status === input.status) return view(ctx, userId, match, true);
    if (input.status === 'going') {
      if (at >= naturalTimes(match).close) throw appError('MATCH_CLOSED');
      const needed = TIER_WAVE[ctx.tier];
      if (rank(currentWave(match, at)) < rank(needed)) {
        const opensAt = naturalTimes(match)[needed] as Date;
        throw appError('MATCH_NOT_OPEN_FOR_YOU', { opensAt: opensAt.toISOString() });
      }
    }
    await deps.matches.putAttendance({
      groupId: ctx.groupId,
      matchId,
      userId,
      status: input.status,
      respondedAt: at.toISOString(),
      createdAt: current?.createdAt ?? at.toISOString(),
    });
    const after = await stateOf(match, true);
    await notifyPromoted(ctx, match, before.list, after.list, userId);
    return view(ctx, userId, match, true);
  }

  /** PAR-12, 13: a onda de convidados aberta e a lista não fechada. */
  function requireGuestWave(match: StoredMatch, at: Date): void {
    if (at >= naturalTimes(match).close) throw appError('MATCH_CLOSED');
    if (currentWave(match, at) !== 'guests') {
      const opensAt = naturalTimes(match).guests;
      throw appError('MATCH_NOT_OPEN_FOR_YOU', {
        ...(opensAt !== undefined && { opensAt: opensAt.toISOString() }),
      });
    }
  }

  /** PAR-11, 12. */
  async function requestGuest(
    userId: UserId,
    publicId: PublicGroupId,
    matchId: string,
    input: RequestMatchGuestInput,
  ): Promise<Match> {
    const ctx = await deps.groups.access(userId, publicId);
    const match = await load(ctx.groupId, matchId);
    const at = now();
    requireLive(match, at);
    requireGuestWave(match, at);
    const manage = canManage(ctx);
    const iso = at.toISOString();
    const entity = newEntity<Omit<StoredGuest, 'updatedAt'>>(
      {
        groupId: ctx.groupId,
        matchId,
        name: input.name,
        normalizedName: normalizeGuestName(input.name),
        requestedBy: userId,
        version: 1,
        ...(manage && { approvedAt: iso, approvedBy: userId }),
      },
      at,
    );
    const guest: StoredGuest = { ...entity, updatedAt: entity.createdAt };
    const result = await deps.matches.requestGuest(guest, MATCH_GUEST_MAX);
    if (result === 'duplicate') throw appError('MATCH_GUEST_DUPLICATE');
    if (result === 'limit') throw appError('MATCH_GUEST_LIMIT', { limit: MATCH_GUEST_MAX });
    if (!manage) {
      const [admins, people] = await Promise.all([
        deps.groups.holders(ctx.groupId, MANAGE),
        profiles([userId]),
      ]);
      const who = people.get(userId)?.nickname ?? 'Alguém';
      await Promise.all(
        admins
          .filter((u) => u !== userId)
          .map((u) =>
            deps.notifications.notify(u, {
              type: 'match_guest_requested',
              title: 'Pedido de convidado',
              body: `${who} quer trazer ${input.name} para a partida de ${ctx.name}.`,
              link: linkOf(ctx, matchId),
            }),
          ),
      );
    }
    return view(ctx, userId, match, true);
  }

  async function loadGuest(match: StoredMatch, guestId: string): Promise<StoredGuest> {
    const guest = await deps.matches.getGuest(match.groupId, match.id, guestId, { consistent: true });
    if (!guest) throw appError('MATCH_GUEST_NOT_FOUND');
    return guest;
  }

  /** Grava o passo; outro chegou antes → `MATCH_GUEST_NOT_PENDING` com a situação atual (PAR-13, 14). */
  async function transition(
    match: StoredMatch,
    guest: StoredGuest,
    step: GuestTransition,
    by: UserId,
    at: Date,
  ): Promise<void> {
    const ok = await deps.matches.transitionGuest({ guest, transition: step, by, at });
    if (!ok) {
      const current = await loadGuest(match, guest.id);
      throw appError('MATCH_GUEST_NOT_PENDING', { status: guestStatus(current) });
    }
  }

  function requirePending(guest: StoredGuest): void {
    const status = guestStatus(guest);
    if (status !== 'pending') throw appError('MATCH_GUEST_NOT_PENDING', { status });
  }

  /** PAR-13: liberar. A posição é a da liberação (PAR-09). */
  async function approveGuest(
    userId: UserId,
    publicId: PublicGroupId,
    matchId: string,
    guestId: string,
  ): Promise<Match> {
    const ctx = await deps.groups.access(userId, publicId);
    requireManage(ctx);
    const match = await load(ctx.groupId, matchId);
    const at = now();
    requireLive(match, at);
    const guest = await loadGuest(match, guestId);
    requirePending(guest);
    requireGuestWave(match, at);
    await transition(match, guest, 'approve', userId, at);
    return view(ctx, userId, match, true);
  }

  /** PAR-13: recusar, até o início, sem aviso. */
  async function declineGuest(
    userId: UserId,
    publicId: PublicGroupId,
    matchId: string,
    guestId: string,
  ): Promise<Match> {
    const ctx = await deps.groups.access(userId, publicId);
    requireManage(ctx);
    const match = await load(ctx.groupId, matchId);
    const at = now();
    requireLive(match, at);
    const guest = await loadGuest(match, guestId);
    requirePending(guest);
    await transition(match, guest, 'decline', userId, at);
    return view(ctx, userId, match, true);
  }

  /** PAR-14: o `pending` só quem pediu cancela; o `approved` quem pediu ou quem tem `matches.manage` remove. */
  async function removeGuest(
    userId: UserId,
    publicId: PublicGroupId,
    matchId: string,
    guestId: string,
  ): Promise<Match> {
    const ctx = await deps.groups.access(userId, publicId);
    const match = await load(ctx.groupId, matchId);
    const at = now();
    requireLive(match, at);
    const guest = await loadGuest(match, guestId);
    const status = guestStatus(guest);
    if (status !== 'pending' && status !== 'approved') throw appError('MATCH_GUEST_NOT_PENDING', { status });
    const mine = guest.requestedBy === userId;
    if (!(mine || (status === 'approved' && canManage(ctx)))) {
      throw appError('GROUP_PERMISSION_DENIED', { permission: MANAGE });
    }
    if (status === 'pending') {
      await transition(match, guest, 'cancel', userId, at);
      return view(ctx, userId, match, true);
    }
    const before = await stateOf(match, true);
    await transition(match, guest, 'remove', userId, at);
    const after = await stateOf(match, true);
    await notifyPromoted(ctx, match, before.list, after.list);
    return view(ctx, userId, match, true);
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
    const ctx = await deps.groups.access(userId, publicId);
    requireManage(ctx);
    const series = await loadSeries(ctx.groupId, seriesId);
    if (series.endedAt !== undefined) throw appError('MATCH_SERIES_ENDED');
    const saved = await deps.matches.updateSeries(
      {
        ...series,
        weekday: input.weekday,
        time: input.time,
        durationMinutes: input.durationMinutes,
        ...setupOf(input),
      },
      input.expectedVersion,
      now(),
    );
    return seriesView(saved);
  }

  /** PAR-23: encerra a repetição; a próxima, que já existe, continua. Encerrar de novo não muda nada. */
  async function endSeries(userId: UserId, publicId: PublicGroupId, seriesId: string): Promise<MatchSeries> {
    const ctx = await deps.groups.access(userId, publicId);
    requireManage(ctx);
    const series = await loadSeries(ctx.groupId, seriesId);
    if (series.endedAt !== undefined) return seriesView(series);
    await deps.matches.endSeries(ctx.groupId, seriesId, now());
    return seriesView(await loadSeries(ctx.groupId, seriesId));
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
    await checkListOpen(match, info, at);
    if (match.seriesId === undefined || at < new Date(match.endsAt)) return;
    const series = await deps.matches.getSeries(match.groupId, match.seriesId, { consistent: true });
    if (series !== undefined && series.currentMatchId === match.id) await rollSeries(series, info, at);
  }

  return {
    create,
    list,
    updateSeries,
    endSeries,
    runAgenda,
    get,
    update,
    advance,
    cancel,
    setAttendance,
    requestGuest,
    approveGuest,
    declineGuest,
    removeGuest,
    saveTeams,
  };
}

export type MatchService = ReturnType<typeof createMatchService>;
