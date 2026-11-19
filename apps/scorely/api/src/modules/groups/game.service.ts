import { newEntity } from '@scorely/api/src/lib/entity';
import { appError } from '@scorely/api/src/lib/errors';
import { lazy } from '@scorely/api/src/lib/fn';
import type { UserId } from '@scorely/api/src/lib/ids';
import {
  gameIdOf,
  layerOpensAt,
  localDate,
  nextOccurrence,
  type Occurrence,
  occurrenceOnDate,
  parseGameId,
  timeStatus,
  type WeeklySchedule,
  zonedToUtc,
} from '@scorely/api/src/lib/zoned';
import { findOverlap, nextOccurrenceStart, type Span } from '@scorely/api/src/modules/groups/agenda';
import type { GameRecord, PlayerRecord } from '@scorely/api/src/modules/groups/game.repository';
import type { StoredGroup } from '@scorely/api/src/modules/groups/group.repository';
import {
  type GroupsDeps,
  imageUrls,
  publicPlace,
  requireActive,
  requireMember,
  requirePermission,
} from '@scorely/api/src/modules/groups/groups.deps';
import {
  type GuestRoster,
  publicGame,
  publicGuestGame,
  type RosterAttendee,
  type RosterGame,
} from '@scorely/api/src/modules/groups/roster';
import type { StoredSchedule } from '@scorely/api/src/modules/groups/schedule.repository';
import type { GuestGame, MyAttendance, MyGroup, Tier, UpdateGameInput } from '@scorely/contracts';
import {
  type CreateGameInput,
  CreateGameInputSchema,
  type Game,
  type GameStatus,
  type RescheduleGameInput,
  RescheduleGameInputSchema,
} from '@scorely/contracts';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** GRP-68, 69: até quantos dias à frente o jogo extra e o remarcado podem ir. */
const MAX_DAYS_AHEAD = 30;

/** Tentativas quando outra escrita da agenda passou na frente (GRP-70: relê e confere a sobreposição de novo). */
const ATTEMPTS = 3;

/** GRP-64: o jogo mais longo (6 h). Os próximos jogos que já são item começam, no máximo, 6 h antes de agora. */
const MAX_GAME_MS = 6 * HOUR_MS;

/**
 * Um dos próximos jogos de um grupo num instante (GRP-10, 11): a ocorrência (calculada pelo horário, ou a guardada
 * no item), o horário dele (se ainda ativo) e o item, se já existe.
 */
interface GameSlot {
  id: string;
  group: StoredGroup;
  /** Ausente = jogo extra (GRP-68). */
  scheduleId: string | undefined;
  schedule: StoredSchedule | undefined;
  occurrence: Occurrence;
  record: GameRecord | undefined;
  at: Date;
}

/** Abertura de cada camada (plano 007, D2/D8). `guests` ausente = convidados desligados. */
interface LayerTimes {
  member: string;
  reserve: string;
  guest?: string;
}

function statusOf(slot: Pick<GameSlot, 'occurrence' | 'record' | 'at'>): GameStatus {
  return slot.record?.cancelledAt ? 'cancelled' : timeStatus(slot.occurrence, slot.at);
}

function layersOf(group: StoredGroup, occurrence: Occurrence): LayerTimes {
  const guests = group.guestsOpenHoursBefore;
  return {
    member: occurrence.opensAt,
    reserve: layerOpensAt(occurrence.startsAt, group.reservesOpenHoursBefore),
    ...(guests != null && { guest: layerOpensAt(occurrence.startsAt, guests) }),
  };
}

/** GRP-45, 66: as vagas que valem no jogo: as do jogo, as do horário ou as do grupo. */
function slotsOf(slot: Pick<GameSlot, 'group' | 'schedule' | 'record'>): number {
  return slot.record?.slots ?? slot.schedule?.slots ?? slot.group.slots;
}

/** GRP-46, 66: o mínimo que vale no jogo, ou `undefined` sem mínimo. */
function minOf(slot: Pick<GameSlot, 'group' | 'schedule' | 'record'>): number | undefined {
  return slot.record?.minPlayers ?? slot.schedule?.minPlayers ?? slot.group.minPlayers;
}

/** GRP-62, 66: o lugar do jogo: o guardado no item (GRP-10), ou o do horário, ou o padrão do grupo. */
function placeIdOf(slot: Pick<GameSlot, 'group' | 'schedule' | 'record'>): string | undefined {
  if (slot.record) return slot.record.placeId;
  return slot.schedule?.placeId ?? slot.group.defaultPlaceId;
}

/** O horário no formato das datas (GRP-64), com a abertura dos membros do grupo (GRP-14). */
function weekly(group: StoredGroup, schedule: StoredSchedule): WeeklySchedule {
  return {
    weekday: schedule.weekday,
    start: schedule.start,
    end: schedule.end,
    timeZone: group.timeZone,
    listOpensHoursBefore: group.listOpensHoursBefore,
  };
}

/** GRP-10: a ocorrência guardada no item (o início e o fim de quando ele nasceu). */
function occurrenceOfRecord(group: StoredGroup, record: GameRecord): Occurrence {
  return {
    date: record.date,
    startsAt: record.startsAt,
    opensAt: layerOpensAt(record.startsAt, group.listOpensHoursBefore),
    endsAt: record.endsAt,
  };
}

/** "06/11" a partir de "2026-11-06" (texto do aviso em pt-BR, NTF-03). */
function dayMonth(date: string): string {
  const [, month, day] = date.split('-');
  return `${day}/${month}`;
}

/** GRP-68, 69: o dia, o início e o fim digitados (no fuso do grupo) como instantes UTC. */
function spanOf(group: StoredGroup, when: { date: string; start: string; end: string }) {
  return {
    date: when.date,
    startsAt: zonedToUtc(when.date, when.start, group.timeZone).toISOString(),
    endsAt: zonedToUtc(when.date, when.end, group.timeZone).toISOString(),
  };
}

/** O dia de `date` mais `days` (datas locais `YYYY-MM-DD`). */
function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** "15:00", no fuso do grupo (texto do aviso em pt-BR, NTF-03). */
function hourMinute(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(instant));
}

/** Posição do usuário na lista (D4 do 003): antes de `slots` = dentro; o resto = fila. */
function myAttendance(list: PlayerRecord[], slots: number, userId: UserId): MyAttendance | undefined {
  const index = list.findIndex((a) => a.userId === userId);
  if (index < 0) return undefined;
  return index < slots
    ? { list: 'confirmed', position: index + 1 }
    : { list: 'waitlist', position: index - slots + 1 };
}

export function createGameService(deps: GroupsDeps) {
  const now = deps.now ?? (() => new Date());

  /**
   * GRP-10, 11: os próximos jogos do grupo, em ordem de início. O próximo de cada horário ativo, mais os jogos que já
   * são item e ainda não acabaram (o horário pode ter mudado de dia depois, GRP-67).
   */
  async function upcomingSlots(group: StoredGroup, at: Date): Promise<GameSlot[]> {
    const items = (
      await deps.games.listByGroup(group.id, {
        startsFrom: new Date(at.getTime() - MAX_GAME_MS).toISOString(),
      })
    ).filter((r) => Date.parse(r.endsAt) > at.getTime());
    const scheduleOf = (id: string) => group.schedules.find((s) => s.id === id);
    // O próximo de cada horário, pela chave (uma leitura por horário); a janela acima só traz os que sobraram.
    const fromSchedules = await Promise.all(
      group.schedules.map(async (schedule): Promise<GameSlot> => {
        const first = nextOccurrence(weekly(group, schedule), at);
        const firstRecord = await deps.games.get(gameIdOf(schedule.id, first.date));
        // GRP-10, 67: um horário tem um jogo por data. Se o jogo dessa data já aconteceu (o horário mudou de hora no mesmo
        // dia, depois de o jogo virar item), o próximo é o da semana seguinte.
        const consumed = firstRecord && Date.parse(firstRecord.endsAt) <= at.getTime();
        const computed = consumed
          ? nextOccurrence(weekly(group, schedule), new Date(Date.parse(first.endsAt)))
          : first;
        const id = gameIdOf(schedule.id, computed.date);
        const record = consumed ? await deps.games.get(id) : firstRecord;
        return {
          id,
          group,
          scheduleId: schedule.id,
          schedule,
          occurrence: record ? occurrenceOfRecord(group, record) : computed,
          record,
          at,
        };
      }),
    );
    const known = new Set(fromSchedules.map((s) => s.id));
    const extra = items
      .filter((r) => !known.has(r.id))
      .map(
        (record): GameSlot => ({
          id: record.id,
          group,
          scheduleId: record.scheduleId,
          schedule: record.scheduleId === undefined ? undefined : scheduleOf(record.scheduleId),
          occurrence: occurrenceOfRecord(group, record),
          record,
          at,
        }),
      );
    return [...fromSchedules, ...extra]
      .filter((s) => Date.parse(s.occurrence.endsAt) > at.getTime())
      .sort((a, b) => a.occurrence.startsAt.localeCompare(b.occurrence.startsAt) || a.id.localeCompare(b.id));
  }

  /** O jogo da rota: só um dos próximos (GRP-11). Outro, ou de outro grupo → `GAME_NOT_FOUND`. */
  async function loadGame(group: StoredGroup, gameId: string): Promise<GameSlot> {
    const found = (await upcomingSlots(group, now())).find((s) => s.id === gameId);
    if (!found) throw appError('GAME_NOT_FOUND');
    return found;
  }

  /** Confirmar/desistir: jogo aberto e a camada de quem pede já aberta (D8 do 007). */
  function assertListWritable(slot: GameSlot, role: Tier): void {
    const status = statusOf(slot);
    if (status === 'cancelled') throw appError('GAME_CANCELLED');
    if (status === 'in_progress') throw appError('GAME_CLOSED');
    const opensAt = layersOf(slot.group, slot.occurrence)[role];
    if (!opensAt) throw appError('GAME_LINK_INVALID');
    if (slot.at.getTime() < new Date(opensAt).getTime()) throw appError('GAME_LIST_NOT_OPEN', { opensAt });
  }

  /**
   * GRP-10: materializa o jogo virtual, guardando o início, o fim e o lugar de agora. A chave é o id do jogo: perdeu a
   * corrida → relê o vencedor.
   */
  async function createRecord(slot: GameSlot): Promise<{ record: GameRecord; won: boolean }> {
    if (slot.record) return { record: slot.record, won: false };
    const at = slot.at.toISOString();
    const placeId = placeIdOf(slot);
    const created: GameRecord = {
      id: slot.id,
      groupId: slot.group.id,
      ...(slot.scheduleId !== undefined && { scheduleId: slot.scheduleId }),
      date: slot.occurrence.date,
      startsAt: slot.occurrence.startsAt,
      endsAt: slot.occurrence.endsAt,
      ...(placeId && { placeId }),
      createdAt: at,
      updatedAt: at,
    };
    if (await deps.games.create(created)) return { record: created, won: true };
    const winner = await deps.games.get(slot.id, { consistent: true });
    if (!winner) throw new Error('Game exists but could not be read');
    return { record: winner, won: false };
  }

  async function ensureRecord(slot: GameSlot): Promise<GameRecord> {
    return (await createRecord(slot)).record;
  }

  /**
   * ADR 0016: o item e a versão esperada para uma edição. O jogo virtual manda `0`: ele vira item agora, e quem perdeu a
   * corrida da criação recebe `VERSION_CONFLICT`.
   */
  async function recordForWrite(
    slot: GameSlot,
    version: number,
  ): Promise<{ record: GameRecord; expected: number }> {
    if (slot.record) return { record: slot.record, expected: version };
    if (version !== 0) throw appError('VERSION_CONFLICT', { currentVersion: 0 });
    const { record, won } = await createRecord(slot);
    if (!won) throw appError('VERSION_CONFLICT', { currentVersion: record.version ?? 0 });
    // A versão que o banco deu ao item novo.
    const fresh = (await deps.games.get(slot.id, { consistent: true })) ?? record;
    return { record: fresh, expected: fresh.version ?? 0 };
  }

  /** GRP-70: os jogos do grupo (itens e calculados dos horários ativos) que batem com o intervalo. */
  async function conflictOf(
    group: StoredGroup,
    candidate: Span & { gameId?: string; date: string },
    schedules: StoredSchedule[],
  ): Promise<string | undefined> {
    const from = new Date(Date.parse(candidate.startsAt) - MAX_GAME_MS).toISOString();
    const items = await deps.games.listByGroup(group.id, { startsFrom: from });
    const calculated = await Promise.all(
      schedules
        .filter((s) => !s.archivedAt)
        .flatMap((s) =>
          [-1, 0, 1].map((d) => {
            const date = shiftDate(candidate.date, d);
            const occurrence = occurrenceOnDate(weekly(group, s), date);
            return occurrence && { id: gameIdOf(s.id, date), occurrence };
          }),
        )
        .filter((c) => c !== undefined)
        // A ocorrência que já é item vale pelo item (o horário original de um jogo remarcado fica livre).
        .map(async (c) => ((await deps.games.get(c.id)) ? undefined : { id: c.id, ...c.occurrence })),
    );
    const others = [...items, ...calculated.filter((c) => c !== undefined)];
    return findOverlap(candidate, others);
  }

  /** Repete a escrita enquanto outra escrita da agenda passa na frente (`stale`). */
  async function retry<T>(attempt: number, write: () => Promise<T | 'stale'>): Promise<T> {
    const result = await write();
    if (result !== 'stale') return result;
    if (attempt >= ATTEMPTS) throw new Error('Game write kept conflicting with other writes');
    return retry(attempt + 1, write);
  }

  /** GRP-68, 69: o início é depois de agora e no máximo 30 dias à frente. */
  function checkRange(startsAt: string): void {
    const start = Date.parse(startsAt);
    const at = now().getTime();
    if (start <= at || start > at + MAX_DAYS_AHEAD * DAY_MS) {
      throw appError('GAME_START_OUT_OF_RANGE', { maxDays: MAX_DAYS_AHEAD });
    }
  }

  /** GRP-68, 69: o lugar é um lugar ativo do grupo. */
  async function checkPlace(groupId: string, placeId: string | undefined): Promise<void> {
    if (placeId === undefined) return;
    const place = await deps.places.get(groupId, placeId);
    if (!place || place.archivedAt) throw appError('PLACE_NOT_FOUND');
  }

  async function listOf(record: GameRecord | undefined): Promise<PlayerRecord[]> {
    return record ? deps.games.listPlayers(record.id, { consistent: true }) : [];
  }

  /** Papel de cada pessoa da lista (D9): pelo papel atual no grupo; quem não participa é convidado. */
  async function rolesOf(groupId: string): Promise<Map<string, Tier>> {
    const members = await deps.groups.listMembers(groupId);
    return new Map(members.map((m) => [m.userId, m.tier]));
  }

  /** A lista com os dois ids de cada pessoa (interna, para os times); a resposta sai pelo `view`. */
  async function rosterView(userId: UserId, slot: GameSlot, role: Tier): Promise<RosterGame> {
    const { group, occurrence, record } = slot;
    const list = await listOf(record);
    const [users, roles] = await Promise.all([
      deps.users.getMany(list.map((a) => a.userId)),
      rolesOf(group.id),
    ]);
    const byId = new Map(users.map((u) => [u.id, u]));
    // Toda presença é de alguém com conta: sem o perfil, é dado inconsistente (bug), não um caso previsto.
    const attendees = list.map((a): RosterAttendee => {
      const user = byId.get(a.userId);
      if (!user) throw new Error('Attendee without a user profile');
      return {
        userId: a.userId,
        publicId: user.publicId,
        nickname: user.nickname,
        confirmedAt: a.confirmedAt,
        tier: roles.get(a.userId) ?? ('guest' as const),
      };
    });
    const layers = layersOf(group, occurrence);
    const myOpensAt = layers[role];
    const slots = slotsOf(slot);
    const minPlayers = minOf(slot);
    const me = myAttendance(list, slots, userId);
    // GRP-62, 63, 66: o lugar do jogo.
    const placeId = placeIdOf(slot);
    const place = placeId ? await deps.places.get(group.id, placeId) : undefined;
    return {
      id: slot.id,
      groupId: group.id,
      ...(slot.scheduleId !== undefined && { scheduleId: slot.scheduleId }),
      version: record?.version ?? 0,
      ...(record?.rescheduledAt !== undefined && { rescheduled: true as const }),
      date: occurrence.date,
      startsAt: occurrence.startsAt,
      endsAt: occurrence.endsAt,
      opensAt: occurrence.opensAt,
      reservesOpensAt: layers.reserve,
      ...(layers.guest && { guestsOpensAt: layers.guest }),
      ...(myOpensAt && { myOpensAt }),
      status: statusOf(slot),
      slots,
      ...(minPlayers !== undefined && { minPlayers }),
      ...(record?.slots !== undefined && { slotsCustom: true }),
      ...(record?.minPlayers !== undefined && { minPlayersCustom: true }),
      ...(place && { place: publicPlace(place) }),
      confirmed: attendees.slice(0, slots),
      waitlist: attendees.slice(slots),
      ...(me && { me }),
    };
  }

  /** O jogo como sai na resposta: as pessoas pelo id público (USR-16). */
  async function view(userId: UserId, slot: GameSlot, role: Tier): Promise<Game> {
    return publicGame(await rosterView(userId, slot, role));
  }

  /** GET /play/{token} com os dois ids (interno): os próximos jogos do grupo (GRP-09). */
  async function guestRoster(userId: UserId, token: string): Promise<GuestRoster> {
    const { group, role } = await byGuestLink(userId, token);
    const slots = await upcomingSlots(group, now());
    const games = await Promise.all(slots.map((slot) => rosterView(userId, slot, role)));
    const { id, name, sportId, timeZone } = group;
    return {
      // GRP-36: o convidado também vê o logo e a capa
      group: { id, name, sportId, timeZone, ...imageUrls(group, deps.media?.urlOf) },
      myTier: role,
      games,
    };
  }

  /**
   * D6 do 003: depois que alguém de dentro saiu, quem agora ocupa a última vaga e estava na fila é avisado.
   * `before` é a lista lida antes da saída. Convidado recebe o link do jogo; membro e reserva, o do grupo.
   */
  async function notifyPromotion(
    slot: GameSlot,
    record: GameRecord,
    before: PlayerRecord[],
    leftUserId: string,
  ): Promise<void> {
    const slots = slotsOf({ ...slot, record });
    const leftIndex = before.findIndex((a) => a.userId === leftUserId);
    if (leftIndex < 0 || leftIndex >= slots) return;
    const after = await deps.games.listPlayers(record.id, { consistent: true });
    const promoted = after[slots - 1];
    if (!promoted) return;
    if (before.findIndex((a) => a.userId === promoted.userId) < slots) return;
    await notifyPromoted(slot.group, promoted.userId);
  }

  /** O link do aviso: convidado (não participa do grupo) recebe o link do jogo; membro e reserva, o do grupo. */
  async function linkFor(group: StoredGroup, userId: UserId): Promise<string> {
    const role = await deps.groups.roleOf(group.id, userId);
    return !role && group.guestToken ? `/play/${group.guestToken}` : `/groups/${group.id}`;
  }

  async function notifyPromoted(group: StoredGroup, userId: UserId): Promise<void> {
    await deps.notifications.notify(userId, {
      type: 'waitlist_promoted',
      title: 'Você entrou na lista',
      body: `Abriu uma vaga no jogo de ${group.name}.`,
      link: await linkFor(group, userId),
    });
  }

  /** GRP-22: as vagas passaram de `from` para `to`: quem estava nessas posições da lista subiu da fila. */
  async function notifyMoreSlots(group: StoredGroup, list: PlayerRecord[], from: number, to: number) {
    for (const a of list.slice(from, Math.max(from, to))) await notifyPromoted(group, a.userId);
  }

  /** GRP-47: na 1ª vez que quem está dentro chega ao mínimo, avisa a lista (dentro e fila), menos quem fez a mudança. */
  async function checkMinReached(slot: GameSlot, record: GameRecord, actorId: UserId): Promise<void> {
    const sized = { ...slot, record };
    const min = minOf(sized);
    if (min === undefined || record.minReachedAt) return;
    const list = await listOf(record);
    if (Math.min(list.length, slotsOf(sized)) < min) return;
    if (!(await deps.games.markMinReached(record.id, slot.at.toISOString()))) return;
    for (const a of list) {
      if (a.userId === actorId) continue;
      await deps.notifications.notify(a.userId, {
        type: 'game_confirmed',
        title: 'Jogo confirmado',
        body: `O jogo de ${slot.group.name} de ${dayMonth(record.date)} vai acontecer: a lista chegou ao mínimo.`,
        link: await linkFor(slot.group, a.userId),
      });
    }
  }

  /** GRP-24: marca o cancelamento e avisa a lista inteira (dentro e fila), menos quem cancelou. Devolve o `cancelledAt`. */
  async function cancelAndNotify(
    group: StoredGroup,
    record: GameRecord,
    at: Date,
    actorId: UserId,
  ): Promise<string> {
    const cancelledAt = at.toISOString();
    await deps.games.cancel(record.id, cancelledAt);
    // Leitura consistente depois do cancelamento: quem confirmou antes dele está aqui e é avisado.
    const list = await listOf(record);
    for (const a of list) {
      if (a.userId === actorId) continue;
      await deps.notifications.notify(a.userId, {
        type: 'game_cancelled',
        title: 'Jogo cancelado',
        body: `O jogo de ${group.name} de ${dayMonth(record.date)} foi cancelado.`,
        link: `/groups/${group.id}`,
      });
    }
    return cancelledAt;
  }

  /** GRP-44: avisa a lista inteira (dentro e fila), menos quem reabriu. Lida depois da reabertura. */
  async function notifyReopened(group: StoredGroup, record: GameRecord, actorId: UserId): Promise<void> {
    const list = await listOf(record);
    for (const a of list) {
      if (a.userId === actorId) continue;
      await deps.notifications.notify(a.userId, {
        type: 'game_reopened',
        title: 'Jogo reaberto',
        body: `O jogo de ${group.name} voltou a valer. Você continua na lista.`,
        link: `/groups/${group.id}`,
      });
    }
  }

  /** GRP-31, 67: cancela os jogos que já são item e ainda não começaram (virtual = ninguém para avisar). */
  async function cancelSlots(slots: GameSlot[], actorId: UserId): Promise<void> {
    for (const slot of slots) {
      if (!slot.record || slot.record.cancelledAt) continue;
      if (timeStatus(slot.occurrence, slot.at) === 'in_progress') continue;
      await cancelAndNotify(slot.group, slot.record, slot.at, actorId);
    }
  }

  async function confirmAs(userId: UserId, group: StoredGroup, role: Tier, gameId: string): Promise<Game> {
    const slot = await loadGame(group, gameId);
    assertListWritable(slot, role);
    const record = await ensureRecord(slot);
    if (!(await deps.games.getPlayer(record.id, userId))) {
      const player: PlayerRecord = { gameId: record.id, userId, confirmedAt: slot.at.toISOString() };
      // A transação confere o jogo e o grupo de novo: cancelado ou arquivado no meio → nada gravado (GRP-24, GRP-32).
      const result = await deps.games.addPlayer(player, group.id);
      if (result === 'archived') throw appError('GROUP_ARCHIVED');
      if (result === 'cancelled') throw appError('GAME_CANCELLED');
      await checkMinReached(slot, record, userId);
    }
    return view(userId, { ...slot, record }, role);
  }

  async function leaveAs(userId: UserId, group: StoredGroup, role: Tier, gameId: string): Promise<void> {
    const slot = await loadGame(group, gameId);
    assertListWritable(slot, role);
    if (!slot.record) return;
    const player = await deps.games.getPlayer(slot.record.id, userId);
    if (!player) return;
    const before = await listOf(slot.record);
    await deps.games.removePlayer(player);
    await notifyPromotion(slot, slot.record, before, userId);
  }

  /** D7: grupo do link do jogo, com o papel de quem abre. Convidados desligados ou token de outro tipo → inválido. */
  async function byGuestLink(userId: UserId, token: string): Promise<{ group: StoredGroup; role: Tier }> {
    const found = await deps.groups.getByToken(token);
    if (found?.kind !== 'guest' || found.group.guestsOpenHoursBefore == null) {
      throw appError('GAME_LINK_INVALID');
    }
    const role = (await deps.groups.roleOf(found.group.id, userId)) ?? 'guest';
    return { group: found.group, role };
  }

  /** Quem participa do grupo, com o grupo ativo (as rotas do jogo do grupo). */
  async function member(userId: UserId, groupId: string) {
    const viewer = await requireMember(deps, userId, groupId);
    requireActive(viewer.group);
    return viewer;
  }

  return {
    /** Os próximos jogos com os dois ids de cada pessoa (interno, para os times). */
    async upcomingRoster(userId: UserId, groupId: string): Promise<RosterGame[]> {
      const { group, tier } = await member(userId, groupId);
      const slots = await upcomingSlots(group, now());
      return Promise.all(slots.map((slot) => rosterView(userId, slot, tier)));
    },

    /** Um dos próximos jogos com os dois ids de cada pessoa (interno, para os times). */
    async gameRoster(userId: UserId, groupId: string, gameId: string): Promise<RosterGame> {
      const { group, tier } = await member(userId, groupId);
      return rosterView(userId, await loadGame(group, gameId), tier);
    },

    /**
     * GRP-10: salvar os times é uma escrita no jogo: o jogo virtual vira item, guardando o início, o fim e o lugar.
     * Já é item → nada muda.
     */
    async materialize(userId: UserId, groupId: string, gameId: string): Promise<void> {
      const { group } = await member(userId, groupId);
      await ensureRecord(await loadGame(group, gameId));
    },

    /** GRP-11: os próximos jogos do grupo, em ordem de início. */
    async upcoming(userId: UserId, groupId: string): Promise<Game[]> {
      const { group, tier } = await member(userId, groupId);
      const slots = await upcomingSlots(group, now());
      return Promise.all(slots.map((slot) => view(userId, slot, tier)));
    },

    /** Resumo do próximo jogo do grupo para "meus grupos" (sem nomes). */
    async summary(userId: UserId, group: StoredGroup): Promise<MyGroup['game']> {
      const [slot] = await upcomingSlots(group, now());
      if (!slot) throw new Error('Active group without schedules');
      const list = await listOf(slot.record);
      const slots = slotsOf(slot);
      const minPlayers = minOf(slot);
      const me = myAttendance(list, slots, userId);
      return {
        id: slot.id,
        date: slot.occurrence.date,
        startsAt: slot.occurrence.startsAt,
        status: statusOf(slot),
        slots,
        ...(minPlayers !== undefined && { minPlayers }),
        confirmedCount: Math.min(list.length, slots),
        ...(me && { me }),
      };
    },

    /** Confirma presença. Já confirmado → mantém a posição (D5 do 003). */
    async confirm(userId: UserId, groupId: string, gameId: string): Promise<Game> {
      const { group, tier } = await member(userId, groupId);
      return confirmAs(userId, group, tier, gameId);
    },

    /** Desiste. Sem presença → nada a fazer. Saiu de dentro → promoção (D6 do 003). */
    async leave(userId: UserId, groupId: string, gameId: string): Promise<void> {
      const { group, tier } = await member(userId, groupId);
      await leaveAs(userId, group, tier, gameId);
    },

    /** GET /play/{token}: os próximos jogos pelo link do jogo (GRP-09). */
    guestRoster,

    async guestView(userId: UserId, token: string): Promise<GuestGame> {
      return publicGuestGame(await guestRoster(userId, token));
    },

    async guestConfirm(userId: UserId, token: string, gameId: string): Promise<Game> {
      const { group, role } = await byGuestLink(userId, token);
      return confirmAs(userId, group, role, gameId);
    },

    async guestLeave(userId: UserId, token: string, gameId: string): Promise<void> {
      const { group, role } = await byGuestLink(userId, token);
      await leaveAs(userId, group, role, gameId);
    },

    /** GRP-24: quem tem `game.manage` cancela um jogo. Já cancelado → devolve igual, sem avisar de novo. */
    async cancel(userId: UserId, groupId: string, gameId: string): Promise<Game> {
      const { group, tier } = await requirePermission(deps, userId, groupId, 'game.manage');
      requireActive(group);
      const slot = await loadGame(group, gameId);
      if (slot.record?.cancelledAt) return view(userId, slot, tier);
      if (timeStatus(slot.occurrence, slot.at) === 'in_progress') throw appError('GAME_CLOSED');
      const record = await ensureRecord(slot);
      const cancelledAt = await cancelAndNotify(group, record, slot.at, userId);
      return view(userId, { ...slot, record: { ...record, cancelledAt } }, tier);
    },

    /**
     * GRP-31: cancela os próximos jogos de um grupo que acabou de ser arquivado. Só `scheduled`/`open` e só com o jogo
     * gravado (virtual = ninguém confirmou, não há quem avisar). Já cancelado → nada. Idempotente.
     */
    async cancelForArchive(group: StoredGroup, actorId: UserId): Promise<void> {
      await cancelSlots(await upcomingSlots(group, now()), actorId);
    },

    /** GRP-67: arquivar um horário cancela o próximo jogo dele (lido com o horário ainda ativo). */
    async cancelForSchedule(group: StoredGroup, scheduleId: string, actorId: UserId): Promise<void> {
      const slots = (await upcomingSlots(group, now())).filter((s) => s.scheduleId === scheduleId);
      await cancelSlots(slots, actorId);
    },

    /**
     * GRP-44: tira o cancelamento de um jogo, antes do início. A lista fica como estava e é avisada,
     * menos quem reabriu. Jogo não cancelado → devolve como está, sem avisar.
     */
    async reopen(userId: UserId, groupId: string, gameId: string): Promise<Game> {
      const { group, tier } = await requirePermission(deps, userId, groupId, 'game.manage');
      requireActive(group);
      const slot = await loadGame(group, gameId);
      const { record } = slot;
      if (!record?.cancelledAt) return view(userId, slot, tier);
      if (timeStatus(slot.occurrence, slot.at) === 'in_progress') throw appError('GAME_CLOSED');
      const result = await deps.games.reopen(record.id, group.id);
      if (result === 'archived') throw appError('GROUP_ARCHIVED');
      const { cancelledAt: _c, ...reopened } = record;
      if (result === 'reopened') await notifyReopened(group, reopened, userId);
      return view(userId, { ...slot, record: reopened }, tier);
    },

    /**
     * GRP-68, 70: marca um jogo extra, fora dos horários. Não avisa ninguém. Ele nasce item, com um id próprio, e só
     * é gravado se não bate com outro jogo do grupo (a revisão da agenda conferida na gravação).
     */
    async createExtra(userId: UserId, groupId: string, input: CreateGameInput): Promise<Game> {
      const { group, tier } = await requirePermission(deps, userId, groupId, 'game.manage');
      requireActive(group);
      const data = CreateGameInputSchema.parse(input);
      await checkPlace(group.id, data.placeId);
      const slots = data.slots ?? group.slots;
      const min = data.minPlayers ?? group.minPlayers;
      if (min !== undefined && min > slots) throw appError('GROUP_MIN_PLAYERS_INVALID', { max: slots });
      const span = spanOf(group, data);
      checkRange(span.startsAt);
      const placeId = data.placeId ?? group.defaultPlaceId;
      const at = now();
      const created = newEntity<GameRecord>(
        {
          groupId: group.id,
          ...span,
          // GRP-62, 66: sem o lugar dele, vale o padrão do grupo (o item guarda o lugar de quando nasceu, GRP-10).
          ...(placeId !== undefined && { placeId }),
          ...(data.slots !== undefined && { slots: data.slots }),
          ...(data.minPlayers !== undefined && { minPlayers: data.minPlayers }),
          updatedAt: at.toISOString(),
        },
        at,
      );
      await retry(1, async () => {
        const { schedules, revision } = await deps.schedules.list(group.id);
        const hit = await conflictOf(group, { ...span, gameId: created.id }, schedules);
        if (hit) throw appError('GAME_OVERLAP', { gameId: hit });
        return (await deps.games.createExtra(created, revision)) === 'created' ? true : 'stale';
      });
      const saved = (await deps.games.get(created.id, { consistent: true })) ?? created;
      const slot: GameSlot = {
        id: saved.id,
        group,
        scheduleId: undefined,
        schedule: undefined,
        occurrence: occurrenceOfRecord(group, saved),
        record: saved,
        at,
      };
      return view(userId, slot, tier);
    },

    /**
     * GRP-69, 70: remarca um dos próximos jogos (o dia, a hora e o lugar; o horário não muda). Não passa do jogo
     * seguinte do mesmo horário nem bate com outro jogo do grupo. Avisa a lista, menos quem remarcou.
     */
    async reschedule(
      userId: UserId,
      groupId: string,
      gameId: string,
      input: RescheduleGameInput,
    ): Promise<Game> {
      const { group, tier } = await requirePermission(deps, userId, groupId, 'game.manage');
      requireActive(group);
      const data = RescheduleGameInputSchema.parse(input);
      const slot = await loadGame(group, gameId);
      const status = statusOf(slot);
      if (status === 'cancelled') throw appError('GAME_CANCELLED');
      if (status === 'in_progress') throw appError('GAME_CLOSED');
      await checkPlace(group.id, data.placeId);
      const span = spanOf(group, data);
      const currentPlace = placeIdOf(slot);
      const unchanged =
        span.startsAt === slot.occurrence.startsAt &&
        span.endsAt === slot.occurrence.endsAt &&
        (data.placeId === undefined || data.placeId === currentPlace);
      if (unchanged) return view(userId, slot, tier);
      checkRange(span.startsAt);
      const original = parseGameId(slot.id);
      if (slot.schedule && original) {
        const nextStart = nextOccurrenceStart(slot.schedule, group.timeZone, original.date);
        if (Date.parse(span.endsAt) > Date.parse(nextStart)) {
          const nextDate = localDate(new Date(nextStart), group.timeZone);
          throw appError('GAME_OVERLAP', { gameId: gameIdOf(slot.schedule.id, nextDate) });
        }
      }
      // O jogo virtual só vira item depois de conferir a agenda (um erro não deixa item), e uma vez só.
      const target = lazy(() => recordForWrite(slot, data.version));
      const saved = await retry(1, async () => {
        const { schedules, revision } = await deps.schedules.list(group.id);
        const hit = await conflictOf(group, { ...span, gameId: slot.id }, schedules);
        if (hit) throw appError('GAME_OVERLAP', { gameId: hit });
        const { record, expected } = await target();
        return deps.games.reschedule(
          record.id,
          { ...span, ...(data.placeId !== undefined && { placeId: data.placeId }) },
          expected,
          revision,
        );
      });
      const list = await listOf(saved);
      await Promise.all(
        list
          .filter((a) => a.userId !== userId)
          .map(async (a) =>
            deps.notifications.notify(a.userId, {
              type: 'game_rescheduled',
              title: `Jogo remarcado: ${group.name}`,
              body: `Agora é ${dayMonth(span.date)} às ${hourMinute(span.startsAt, group.timeZone)}`,
              link: await linkFor(group, a.userId),
            }),
          ),
      );
      return view(userId, { ...slot, occurrence: occurrenceOfRecord(group, saved), record: saved }, tier);
    },

    /**
     * GRP-70: o 1º jogo que já é item (e ainda não acabou, de outro horário) com que as ocorrências de um horário nos
     * próximos 30 dias batem. Os jogos do próprio horário que já são item ficam como estão (GRP-67).
     */
    async scheduleConflict(
      group: StoredGroup,
      candidate: { weekday: number; start: string; end: string },
      exceptScheduleId?: string,
    ): Promise<string | undefined> {
      const at = now();
      const items = (
        await deps.games.listByGroup(group.id, {
          startsFrom: new Date(at.getTime() - MAX_GAME_MS).toISOString(),
        })
      ).filter((r) => r.scheduleId === undefined || r.scheduleId !== exceptScheduleId);
      const weeklyCandidate: WeeklySchedule = {
        ...candidate,
        timeZone: group.timeZone,
        listOpensHoursBefore: 0,
      };
      const today = localDate(at, group.timeZone);
      const spans = Array.from({ length: MAX_DAYS_AHEAD + 2 }, (_, i) =>
        occurrenceOnDate(weeklyCandidate, shiftDate(today, i - 1)),
      ).filter((o): o is Occurrence => o !== undefined && Date.parse(o.endsAt) > at.getTime());
      return spans.map((o) => findOverlap(o, items)).find((id) => id !== undefined);
    },

    /**
     * GRP-45, 46: vagas e mínimo só de um jogo (`null` = volta ao padrão). Não desce abaixo de quem está dentro; mais
     * vagas promovem a fila (GRP-22); chegar ao mínimo avisa (GRP-47).
     */
    async updateGame(userId: UserId, groupId: string, gameId: string, patch: UpdateGameInput): Promise<Game> {
      const { group, tier } = await requirePermission(deps, userId, groupId, 'game.manage');
      requireActive(group);
      const slot = await loadGame(group, gameId);
      const status = statusOf(slot);
      if (status === 'cancelled') throw appError('GAME_CANCELLED');
      if (status === 'in_progress') throw appError('GAME_CLOSED');
      const current = slotsOf(slot);
      const fallback = { ...slot, record: undefined };
      const slots = patch.slots === undefined ? current : (patch.slots ?? slotsOf(fallback));
      const min = patch.minPlayers === undefined ? minOf(slot) : (patch.minPlayers ?? minOf(fallback));
      const list = await listOf(slot.record);
      const inside = Math.min(list.length, current);
      if (slots < inside) throw appError('GAME_SLOTS_BELOW_CONFIRMED', { confirmed: inside });
      if (min !== undefined && min > slots) throw appError('GROUP_MIN_PLAYERS_INVALID', { max: slots });
      const target = await recordForWrite(slot, patch.version);
      const record = await deps.games.updateSettings(
        target.record.id,
        {
          ...(patch.slots !== undefined && { slots: patch.slots }),
          ...(patch.minPlayers !== undefined && { minPlayers: patch.minPlayers }),
        },
        target.expected,
      );
      await notifyMoreSlots(group, list, current, slots);
      await checkMinReached(slot, record, userId);
      return view(userId, { ...slot, record }, tier);
    },

    /**
     * GRP-45, 46, 66: o padrão das vagas vai mudar para `slots`, no grupo (sem `scheduleId`) ou num horário. Os próximos
     * jogos que são item, não estão cancelados e seguem esse padrão não descem abaixo de quem está dentro (lança antes
     * de gravar). O `afterUpdate` roda com o grupo gravado: promove a fila e confere o mínimo (GRP-22, 47).
     */
    async defaultsPlan(
      group: StoredGroup,
      slots: number,
      scheduleId?: string,
    ): Promise<{ afterUpdate: (updated: StoredGroup, actorId: UserId) => Promise<void> }> {
      const affected = (await upcomingSlots(group, now())).filter(
        (s) =>
          s.record &&
          statusOf(s) !== 'cancelled' &&
          s.record.slots === undefined &&
          (scheduleId === undefined ? s.schedule?.slots === undefined : s.scheduleId === scheduleId),
      );
      const lists = await Promise.all(affected.map(async (s) => ({ slot: s, list: await listOf(s.record) })));
      for (const { slot, list } of lists) {
        const inside = Math.min(list.length, slotsOf(slot));
        if (slots < inside) throw appError('GAME_SLOTS_BELOW_CONFIRMED', { confirmed: inside });
      }
      return {
        afterUpdate: async (updated, actorId) => {
          for (const { slot, list } of lists) {
            const record = slot.record;
            if (!record) continue;
            const schedule = updated.schedules.find((x) => x.id === slot.scheduleId);
            const next = { ...slot, group: updated, schedule };
            await notifyMoreSlots(updated, list, slotsOf(slot), slotsOf(next));
            await checkMinReached(next, record, actorId);
          }
        },
      };
    },

    /**
     * Parte do jogo na remoção de um membro ou reserva (D12 do 003): a presença a apagar junto em cada um dos
     * próximos jogos (`scheduled`/`open`/`cancelled`, GRP-25) e a promoção para rodar depois da transação (sem
     * promoção com o jogo cancelado: ninguém joga).
     */
    async removalPlan(
      group: StoredGroup,
      memberId: UserId,
    ): Promise<{ players: PlayerRecord[]; afterRemoval: () => Promise<void> }> {
      const slots = (await upcomingSlots(group, now())).filter(
        (s) => s.record && statusOf(s) !== 'in_progress',
      );
      const found = await Promise.all(
        slots.map(async (slot) => {
          const record = slot.record as GameRecord;
          const player = await deps.games.getPlayer(record.id, memberId);
          if (!player) return undefined;
          const before = statusOf(slot) === 'cancelled' ? undefined : await listOf(record);
          return { slot, record, player, before };
        }),
      );
      const hits = found.filter((x) => x !== undefined);
      return {
        players: hits.map((h) => h.player),
        afterRemoval: async () => {
          for (const h of hits) if (h.before) await notifyPromotion(h.slot, h.record, h.before, memberId);
        },
      };
    },
  };
}
export type GameService = ReturnType<typeof createGameService>;
