import type { Game, GameStatus, GroupRole, GuestGame, MyAttendance, MyGroup } from '@scorely/contracts';
import { newEntity } from '../../lib/entity';
import { appError } from '../../lib/errors';
import { currentOccurrence, layerOpensAt, type Occurrence, timeStatus } from '../../lib/zoned';
import type { AttendanceRecord, GameRecord } from './game.repository';
import type { StoredGroup } from './group.repository';
import { type GroupsDeps, requireMember, requireOwner, reservesHours } from './groups.deps';

/** Jogo atual de um grupo num instante: a ocorrência calculada (D1 do 003) e o item, se já existe. */
interface CurrentGame {
  group: StoredGroup;
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

function statusOf(occurrence: Occurrence, record: GameRecord | undefined, at: Date): GameStatus {
  return record?.cancelledAt ? 'cancelled' : timeStatus(occurrence, at);
}

function layersOf(group: StoredGroup, occurrence: Occurrence): LayerTimes {
  const guests = group.guestsOpenHoursBefore;
  return {
    member: occurrence.opensAt,
    reserve: layerOpensAt(occurrence.startsAt, reservesHours(group)),
    ...(guests != null && { guest: layerOpensAt(occurrence.startsAt, guests) }),
  };
}

/** Posição do usuário na lista (D4 do 003): antes de `slots` = dentro; o resto = fila. */
function myAttendance(list: AttendanceRecord[], slots: number, userId: string): MyAttendance | undefined {
  const index = list.findIndex((a) => a.userId === userId);
  if (index < 0) return undefined;
  return index < slots
    ? { list: 'confirmed', position: index + 1 }
    : { list: 'waitlist', position: index - slots + 1 };
}

export function createGameService(deps: GroupsDeps) {
  const now = deps.now ?? (() => new Date());

  async function load(group: StoredGroup, at: Date): Promise<CurrentGame> {
    const occurrence = currentOccurrence(group, at);
    const record = await deps.games.findByDate(group.id, occurrence.date, { consistent: true });
    return { group, occurrence, record, at };
  }

  /** O jogo da rota: só o atual existe (sem histórico). */
  async function loadByDate(group: StoredGroup, date: string): Promise<CurrentGame> {
    const game = await load(group, now());
    if (game.occurrence.date !== date) throw appError('GAME_NOT_FOUND');
    return game;
  }

  /** Confirmar/desistir: jogo aberto e a camada de quem pede já aberta (D8 do 007). */
  function assertListWritable({ group, occurrence, record, at }: CurrentGame, role: GroupRole): void {
    const status = statusOf(occurrence, record, at);
    if (status === 'cancelled') throw appError('GAME_CANCELLED');
    if (status === 'in_progress') throw appError('GAME_CLOSED');
    const opensAt = layersOf(group, occurrence)[role];
    if (!opensAt) throw appError('GAME_LINK_INVALID');
    if (at.getTime() < new Date(opensAt).getTime()) throw appError('GAME_LIST_NOT_OPEN', { opensAt });
  }

  /** Materializa o jogo virtual (D1/D2 do 003). Perdeu a corrida pelo lookup da data → relê o vencedor. */
  async function ensureRecord({ group, occurrence, record, at }: CurrentGame): Promise<GameRecord> {
    if (record) return record;
    const created = newEntity<GameRecord>({ groupId: group.id, date: occurrence.date }, at);
    if (await deps.games.create(created)) return created;
    const winner = await deps.games.findByDate(group.id, occurrence.date, { consistent: true });
    if (!winner) throw new Error('Game lookup exists but the game could not be read');
    return winner;
  }

  async function listOf(record: GameRecord | undefined): Promise<AttendanceRecord[]> {
    return record ? deps.games.listAttendance(record.id, { consistent: true }) : [];
  }

  /** Papel de cada pessoa da lista (D9): pelo papel atual no grupo; quem não participa é convidado. */
  async function rolesOf(groupId: string): Promise<Map<string, GroupRole>> {
    const members = await deps.groups.listMembers(groupId);
    return new Map(members.map((m) => [m.userId, m.role]));
  }

  async function view(userId: string, game: CurrentGame, role: GroupRole): Promise<Game> {
    const { group, occurrence, record, at } = game;
    const list = await listOf(record);
    const [users, roles] = await Promise.all([
      deps.users.getMany(list.map((a) => a.userId)),
      rolesOf(group.id),
    ]);
    const names = new Map(users.map((u) => [u.id, u.nickname ?? u.name]));
    const attendees = list.map((a) => {
      const name = names.get(a.userId);
      return {
        userId: a.userId,
        ...(name && { name }),
        confirmedAt: a.confirmedAt,
        role: roles.get(a.userId) ?? ('guest' as const),
      };
    });
    const layers = layersOf(group, occurrence);
    const myOpensAt = layers[role];
    const me = myAttendance(list, group.slots, userId);
    return {
      groupId: group.id,
      date: occurrence.date,
      startsAt: occurrence.startsAt,
      opensAt: occurrence.opensAt,
      reservesOpensAt: layers.reserve,
      ...(layers.guest && { guestsOpensAt: layers.guest }),
      ...(myOpensAt && { myOpensAt }),
      status: statusOf(occurrence, record, at),
      slots: group.slots,
      confirmed: attendees.slice(0, group.slots),
      waitlist: attendees.slice(group.slots),
      ...(me && { me }),
    };
  }

  /**
   * D6 do 003: depois que alguém de dentro saiu, quem agora ocupa a última vaga e estava na fila é avisado.
   * `before` é a lista lida antes da saída. Convidado recebe o link do jogo; membro e reserva, o do grupo.
   */
  async function notifyPromotion(
    group: StoredGroup,
    record: GameRecord,
    before: AttendanceRecord[],
    leftUserId: string,
  ): Promise<void> {
    const leftIndex = before.findIndex((a) => a.userId === leftUserId);
    if (leftIndex < 0 || leftIndex >= group.slots) return;
    const after = await deps.games.listAttendance(record.id, { consistent: true });
    const promoted = after[group.slots - 1];
    if (!promoted) return;
    if (before.findIndex((a) => a.userId === promoted.userId) < group.slots) return;
    const role = await deps.groups.roleOf(group.id, promoted.userId);
    const link = !role && group.guestToken ? `/play/${group.guestToken}` : `/groups/${group.id}`;
    await deps.notifications.notify(promoted.userId, {
      type: 'waitlist_promoted',
      title: 'Você entrou na lista',
      body: `Abriu uma vaga no jogo de ${group.name}.`,
      link,
    });
  }

  async function confirmAs(userId: string, group: StoredGroup, role: GroupRole, date: string): Promise<Game> {
    const game = await loadByDate(group, date);
    assertListWritable(game, role);
    const record = await ensureRecord(game);
    if (!(await deps.games.getAttendance(record.id, userId))) {
      const attendance = newEntity<AttendanceRecord>(
        { gameId: record.id, userId, confirmedAt: game.at.toISOString() },
        game.at,
      );
      await deps.games.addAttendance(attendance);
    }
    return view(userId, { ...game, record }, role);
  }

  async function leaveAs(userId: string, group: StoredGroup, role: GroupRole, date: string): Promise<void> {
    const game = await loadByDate(group, date);
    assertListWritable(game, role);
    if (!game.record) return;
    const attendance = await deps.games.getAttendance(game.record.id, userId);
    if (!attendance) return;
    const before = await listOf(game.record);
    await deps.games.removeAttendance(attendance);
    await notifyPromotion(group, game.record, before, userId);
  }

  /** D7: grupo do link do jogo, com o papel de quem abre. Convidados desligados ou token de outro tipo → inválido. */
  async function byGuestLink(
    userId: string,
    token: string,
  ): Promise<{ group: StoredGroup; role: GroupRole }> {
    const found = await deps.groups.getByToken(token);
    if (found?.kind !== 'guest' || found.group.guestsOpenHoursBefore == null) {
      throw appError('GAME_LINK_INVALID');
    }
    const role = (await deps.groups.roleOf(found.group.id, userId)) ?? 'guest';
    return { group: found.group, role };
  }

  return {
    async current(userId: string, groupId: string): Promise<Game> {
      const { group, role } = await requireMember(deps, userId, groupId);
      return view(userId, await load(group, now()), role);
    },

    /** Resumo do jogo atual para "meus grupos" (sem nomes). */
    async summary(userId: string, group: StoredGroup): Promise<MyGroup['game']> {
      const { occurrence, record, at } = await load(group, now());
      const list = await listOf(record);
      const me = myAttendance(list, group.slots, userId);
      return {
        date: occurrence.date,
        startsAt: occurrence.startsAt,
        status: statusOf(occurrence, record, at),
        slots: group.slots,
        confirmedCount: Math.min(list.length, group.slots),
        ...(me && { me }),
      };
    },

    /** Confirma presença. Já confirmado → mantém a posição (D5 do 003). */
    async confirm(userId: string, groupId: string, date: string): Promise<Game> {
      const { group, role } = await requireMember(deps, userId, groupId);
      return confirmAs(userId, group, role, date);
    },

    /** Desiste. Sem presença → nada a fazer. Saiu de dentro → promoção (D6 do 003). */
    async leave(userId: string, groupId: string, date: string): Promise<void> {
      const { group, role } = await requireMember(deps, userId, groupId);
      await leaveAs(userId, group, role, date);
    },

    /** GET /play/{token}: o jogo atual pelo link do jogo (D7). */
    async guestView(userId: string, token: string): Promise<GuestGame> {
      const { group, role } = await byGuestLink(userId, token);
      const game = await view(userId, await load(group, now()), role);
      const { id, name, sport, weekday, time, timeZone, location } = group;
      return {
        group: { id, name, sport, weekday, time, timeZone, ...(location && { location }) },
        myRole: role,
        game,
      };
    },

    async guestConfirm(userId: string, token: string, date: string): Promise<Game> {
      const { group, role } = await byGuestLink(userId, token);
      return confirmAs(userId, group, role, date);
    },

    async guestLeave(userId: string, token: string, date: string): Promise<void> {
      const { group, role } = await byGuestLink(userId, token);
      await leaveAs(userId, group, role, date);
    },

    /** Dono cancela o jogo atual. Já cancelado → devolve igual, sem avisar de novo. */
    async cancel(userId: string, groupId: string, date: string): Promise<Game> {
      const group = await requireOwner(deps, userId, groupId);
      const game = await loadByDate(group, date);
      if (game.record?.cancelledAt) return view(userId, game, 'member');
      if (timeStatus(game.occurrence, game.at) === 'in_progress') throw appError('GAME_CLOSED');
      const record = await ensureRecord(game);
      const cancelledAt = game.at.toISOString();
      await deps.games.cancel(record.id, cancelledAt);
      const list = await listOf(record);
      for (const a of list) {
        if (a.userId === group.ownerId) continue;
        await deps.notifications.notify(a.userId, {
          type: 'game_cancelled',
          title: 'Jogo cancelado',
          body: `O jogo de ${group.name} foi cancelado.`,
          link: `/groups/${group.id}`,
        });
      }
      return view(userId, { ...game, record: { ...record, cancelledAt } }, 'member');
    },

    /**
     * Parte do jogo na remoção de um membro ou reserva (D12 do 003): a presença a apagar junto (só com a
     * lista `scheduled`/`open`) e a promoção para rodar depois da transação.
     */
    async removalPlan(
      group: StoredGroup,
      memberId: string,
    ): Promise<{ attendance?: AttendanceRecord; afterRemoval: () => Promise<void> }> {
      const nothing = { afterRemoval: async () => undefined };
      const { occurrence, record, at } = await load(group, now());
      if (!record) return nothing;
      const status = statusOf(occurrence, record, at);
      if (status !== 'scheduled' && status !== 'open') return nothing;
      const attendance = await deps.games.getAttendance(record.id, memberId);
      if (!attendance) return nothing;
      const before = await listOf(record);
      return { attendance, afterRemoval: () => notifyPromotion(group, record, before, memberId) };
    },
  };
}
export type GameService = ReturnType<typeof createGameService>;
