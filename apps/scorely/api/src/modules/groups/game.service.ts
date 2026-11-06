import type { Game, GameStatus, MyAttendance, MyGroup } from '@scorely/contracts';
import { newEntity } from '../../lib/entity';
import { appError } from '../../lib/errors';
import { currentOccurrence, type Occurrence, timeStatus } from '../../lib/zoned';
import type { AttendanceRecord, GameRecord } from './game.repository';
import type { StoredGroup } from './group.repository';
import { type GroupsDeps, requireMember, requireOwner } from './groups.deps';

/** Jogo atual de um grupo num instante: a ocorrência calculada (D1) e o item, se já existe. */
interface CurrentGame {
  group: StoredGroup;
  occurrence: Occurrence;
  record: GameRecord | undefined;
  at: Date;
}

function statusOf(occurrence: Occurrence, record: GameRecord | undefined, at: Date): GameStatus {
  return record?.cancelledAt ? 'cancelled' : timeStatus(occurrence, at);
}

/** Posição do usuário na lista (D4): antes de `slots` = dentro; o resto = fila. */
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

  /** O jogo da rota: só o atual existe na E1 (sem histórico). */
  async function loadByDate(group: StoredGroup, date: string): Promise<CurrentGame> {
    const game = await load(group, now());
    if (game.occurrence.date !== date) throw appError('GAME_NOT_FOUND');
    return game;
  }

  function assertListWritable({ occurrence, record, at }: CurrentGame): void {
    const status = statusOf(occurrence, record, at);
    if (status === 'cancelled') throw appError('GAME_CANCELLED');
    if (status === 'in_progress') throw appError('GAME_CLOSED');
    if (status === 'scheduled') throw appError('GAME_LIST_NOT_OPEN', { opensAt: occurrence.opensAt });
  }

  /** Materializa o jogo virtual (D1/D2). Perdeu a corrida pelo lookup da data → relê o vencedor. */
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

  async function view(userId: string, game: CurrentGame): Promise<Game> {
    const { group, occurrence, record, at } = game;
    const list = await listOf(record);
    const users = await deps.users.getMany(list.map((a) => a.userId));
    const names = new Map(users.map((u) => [u.id, u.nickname ?? u.name]));
    const attendees = list.map((a) => {
      const name = names.get(a.userId);
      return { userId: a.userId, ...(name && { name }), confirmedAt: a.confirmedAt };
    });
    const me = myAttendance(list, group.slots, userId);
    return {
      groupId: group.id,
      date: occurrence.date,
      startsAt: occurrence.startsAt,
      opensAt: occurrence.opensAt,
      status: statusOf(occurrence, record, at),
      slots: group.slots,
      confirmed: attendees.slice(0, group.slots),
      waitlist: attendees.slice(group.slots),
      ...(me && { me }),
    };
  }

  /**
   * D6: depois que alguém de dentro saiu, quem agora ocupa a última vaga e estava na fila é avisado.
   * `before` é a lista lida antes da saída.
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
    await deps.notifications.notify(promoted.userId, {
      type: 'waitlist_promoted',
      title: 'Você entrou na lista',
      body: `Abriu uma vaga no jogo de ${group.name}.`,
      link: `/groups/${group.id}`,
    });
  }

  return {
    async current(userId: string, groupId: string): Promise<Game> {
      const group = await requireMember(deps, userId, groupId);
      return view(userId, await load(group, now()));
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

    /** Confirma presença. Já confirmado → mantém a posição (D5). */
    async confirm(userId: string, groupId: string, date: string): Promise<Game> {
      const group = await requireMember(deps, userId, groupId);
      const game = await loadByDate(group, date);
      assertListWritable(game);
      const record = await ensureRecord(game);
      if (!(await deps.games.getAttendance(record.id, userId))) {
        const attendance = newEntity<AttendanceRecord>(
          { gameId: record.id, userId, confirmedAt: game.at.toISOString() },
          game.at,
        );
        await deps.games.addAttendance(attendance);
      }
      return view(userId, { ...game, record });
    },

    /** Desiste. Sem presença → nada a fazer. Saiu de dentro → promoção (D6). */
    async leave(userId: string, groupId: string, date: string): Promise<void> {
      const group = await requireMember(deps, userId, groupId);
      const game = await loadByDate(group, date);
      assertListWritable(game);
      if (!game.record) return;
      const attendance = await deps.games.getAttendance(game.record.id, userId);
      if (!attendance) return;
      const before = await listOf(game.record);
      await deps.games.removeAttendance(attendance);
      await notifyPromotion(group, game.record, before, userId);
    },

    /** Dono cancela o jogo atual. Já cancelado → devolve igual, sem avisar de novo. */
    async cancel(userId: string, groupId: string, date: string): Promise<Game> {
      const group = await requireOwner(deps, userId, groupId);
      const game = await loadByDate(group, date);
      if (game.record?.cancelledAt) return view(userId, game);
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
      return view(userId, { ...game, record: { ...record, cancelledAt } });
    },

    /**
     * Parte do jogo na remoção de um membro (D12): a presença a apagar junto (só com a lista
     * `scheduled`/`open`) e a promoção para rodar depois da transação.
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
