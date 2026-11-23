import { newEntity } from '@scorely/api/src/lib/entity';
import { appError } from '@scorely/api/src/lib/errors';
import type { GroupId, UserId } from '@scorely/api/src/lib/ids';
import type { GroupAccess } from '@scorely/api/src/modules/groups/group.access';
import { toUser, type UrlOf } from '@scorely/api/src/modules/groups/group.service';
import type {
  GuestTransition,
  MatchRepository,
  StoredAttendance,
  StoredGuest,
  StoredMatch,
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
  type Match,
  type MatchEntry,
  type MatchGuestStatus,
  type MatchStatus,
  type MatchSummary,
  type MatchWave,
  type MatchWaves,
  type MyAttendance,
  type PublicGroupId,
  type RequestMatchGuestInput,
  type SetAttendanceInput,
  type UpdateMatchInput,
  type User,
} from '@scorely/contracts';

export interface MatchesDeps {
  matches: MatchRepository;
  /** Participação, tier e permissão (GRV-15, 17): o grupo não sabe nada das partidas. */
  groups: GroupAccess;
  users: Pick<UserDirectory, 'getMany'>;
  /** Os avisos `match_promoted` (PAR-09), `match_cancelled` (PAR-07) e `match_guest_requested` (PAR-12). */
  notifications: { notify(...args: Parameters<NotificationService['notify']>): Promise<unknown> };
  /** MID-12: só o `urlOf` da mídia. Sem ele, a mídia de produção. */
  media?: Pick<MediaService, 'urlOf'>;
  now?: () => Date;
}

const HOUR_MS = 3_600_000;

const DAY_MS = 24 * HOUR_MS;
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

/** PAR-16: as horas das ondas, já com o que foi aberto à mão (aberta antes da hora = aberta agora). */
function wavesView(match: StoredMatch, now: Date): MatchWaves {
  const times = naturalTimes(match);
  const advanced = rank(match.advancedTo);
  const opened = (natural: Date | undefined, wave: MatchWave) =>
    advanced >= rank(wave) ? new Date(Math.min(natural?.getTime() ?? now.getTime(), now.getTime())) : natural;
  const guests = opened(times.guests, 'guests');
  return {
    members: (opened(times.members, 'members') as Date).toISOString(),
    reserves: (opened(times.reserves, 'reserves') as Date).toISOString(),
    ...(guests !== undefined && { guests: guests.toISOString() }),
    close: times.close.toISOString(),
  };
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

type Access = Awaited<ReturnType<GroupAccess['access']>>;

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

  const linkOf = (ctx: Access, matchId: string) => `/groups/${ctx.publicId}/matches/${matchId}`;

  function summaryOf(match: StoredMatch, list: Lineup, userId: UserId, at: Date): MatchSummary {
    const wave = currentWave(match, at);
    const mine = myAttendanceOf(list, userId);
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
    };
  }

  /** PAR-16: a partida para quem pede. */
  async function view(ctx: Access, userId: UserId, match: StoredMatch, consistent = false): Promise<Match> {
    const state = await stateOf(match, consistent);
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
      ...summaryOf(match, state.list, userId, at),
      createdAt: match.createdAt,
      version: match.version,
      ...(match.membersHours !== undefined && { membersHours: match.membersHours }),
      ...(match.reservesHours !== undefined && { reservesHours: match.reservesHours }),
      ...(match.guestsHours !== undefined && { guestsHours: match.guestsHours }),
      noGuests: match.noGuests,
      closeHours: match.closeHours,
      waves: wavesView(match, at),
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
      },
    };
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
    const upcoming = await deps.matches.listMatches(ctx.groupId, at);
    if (upcoming.length >= MATCH_MAX_UPCOMING) throw appError('MATCH_LIMIT', { limit: MATCH_MAX_UPCOMING });
    const entity = newEntity<Omit<StoredMatch, 'updatedAt'>>(
      {
        groupId: ctx.groupId,
        ...timesOf(input),
        noGuests: false,
        closeHours: 0,
        createdBy: userId,
        version: 1,
      },
      at,
    );
    const match: StoredMatch = { ...entity, updatedAt: entity.createdAt };
    await deps.matches.createMatch(match);
    return view(ctx, userId, match, true);
  }

  /** PAR-15: as que não terminaram, canceladas incluídas, pelo início. */
  async function list(userId: UserId, publicId: PublicGroupId): Promise<MatchSummary[]> {
    const ctx = await deps.groups.access(userId, publicId);
    const at = now();
    const matches = await deps.matches.listMatches(ctx.groupId, at);
    const participants = await deps.groups.participants(ctx.groupId);
    const summaries = await Promise.all(
      matches.map(async (match) => {
        const [attendances, guests] = await Promise.all([
          deps.matches.listAttendances(match.groupId, match.id),
          deps.matches.listGuests(match.groupId, match.id),
        ]);
        return summaryOf(match, lineup(match, attendances, guests, participants), userId, at);
      }),
    );
    return summaries.sort((a, b) =>
      a.startsAt === b.startsAt ? (a.id < b.id ? -1 : 1) : a.startsAt < b.startsAt ? -1 : 1,
    );
  }

  /** PAR-16. */
  async function get(userId: UserId, publicId: PublicGroupId, matchId: string): Promise<Match> {
    const ctx = await deps.groups.access(userId, publicId);
    return view(ctx, userId, await load(ctx.groupId, matchId));
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
    const saved = await deps.matches.updateMatch({ ...draft, advancedTo }, input.expectedVersion, at);
    const after = lineup(saved, before.attendances, before.guests, before.participants);
    await notifyPromoted(ctx, saved, before.list, after);
    return view(ctx, userId, saved, true);
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
      await deps.matches.advanceMatch(ctx.groupId, matchId, input.wave, at);
    }
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

  return {
    create,
    list,
    get,
    update,
    advance,
    cancel,
    setAttendance,
    requestGuest,
    approveGuest,
    declineGuest,
    removeGuest,
  };
}

export type MatchService = ReturnType<typeof createMatchService>;
