import { newEntity } from '@scorely/api/src/lib/entity';
import { appError } from '@scorely/api/src/lib/errors';
import type { UserId } from '@scorely/api/src/lib/ids';
import { createGameService } from '@scorely/api/src/modules/groups/game.service';
import type { StoredGroup } from '@scorely/api/src/modules/groups/group.repository';
import {
  type GroupsDeps,
  requireActive,
  requireMember,
  requirePermission,
} from '@scorely/api/src/modules/groups/groups.deps';
import { SCHEDULE_LIMIT_BY_PLAN } from '@scorely/api/src/modules/groups/plans';
import type { StoredSchedule } from '@scorely/api/src/modules/groups/schedule.repository';
import {
  minutesOf,
  type Schedule,
  type ScheduleInput,
  ScheduleInputSchema,
  type UpdateScheduleInput,
  UpdateScheduleInputSchema,
  type VersionInput,
} from '@scorely/contracts';

/** Tentativas quando outra escrita mudou os horários no meio (GRP-65: relê e confere a sobreposição de novo). */
const ATTEMPTS = 3;

/** O horário como sai na resposta (sem o grupo e as datas do item). */
function publicSchedule({
  groupId: _g,
  createdAt: _c,
  updatedAt: _u,
  ...schedule
}: StoredSchedule): Schedule {
  return schedule;
}

/** GRP-65: dois horários no mesmo dia se sobrepõem se um começa antes de o outro acabar (o fim é exclusivo). */
function overlaps(
  a: Pick<Schedule, 'weekday' | 'start' | 'end'>,
  b: Pick<Schedule, 'weekday' | 'start' | 'end'>,
) {
  return (
    a.weekday === b.weekday && minutesOf(a.start) < minutesOf(b.end) && minutesOf(b.start) < minutesOf(a.end)
  );
}

/**
 * Horários do grupo (GRP-64–67). A ordem dos erros é a da GRP-52: quem não participa, a permissão (`settings.edit`),
 * o grupo arquivado (GRP-32) e só então os do horário.
 */
export function createScheduleService(deps: GroupsDeps) {
  const now = deps.now ?? (() => new Date());
  const games = createGameService(deps);
  /** GRP-64: o limite vem do plano do grupo (por enquanto, todos no grátis). */
  const max = SCHEDULE_LIMIT_BY_PLAN.free;

  async function manager(userId: UserId, groupId: string): Promise<StoredGroup> {
    const { group } = await requirePermission(deps, userId, groupId, 'settings.edit');
    requireActive(group);
    return group;
  }

  /** GRP-64: o lugar do horário é um lugar ativo do grupo. */
  async function checkPlace(groupId: string, placeId: string | undefined): Promise<void> {
    if (placeId === undefined) return;
    const place = await deps.places.get(groupId, placeId);
    if (!place || place.archivedAt) throw appError('PLACE_NOT_FOUND');
  }

  /** GRP-65: os ativos (menos `except`) com que o horário bate, e a revisão da leitura. */
  async function checkOverlap(
    group: StoredGroup,
    candidate: Pick<Schedule, 'weekday' | 'start' | 'end'>,
    except?: string,
  ): Promise<number> {
    const { schedules, revision } = await deps.schedules.list(group.id);
    const hit = schedules.find((s) => !s.archivedAt && s.id !== except && overlaps(s, candidate));
    if (hit) throw appError('SCHEDULE_OVERLAP', { scheduleId: hit.id });
    // GRP-70: também não bate com um jogo extra ou remarcado (os jogos do próprio horário ficam como estão).
    const game = await games.scheduleConflict(group, candidate, except);
    if (game) throw appError('GAME_OVERLAP', { gameId: game });
    return revision;
  }

  async function mustGet(groupId: string, scheduleId: string): Promise<StoredSchedule> {
    const found = await deps.schedules.get(groupId, scheduleId);
    if (!found) throw appError('SCHEDULE_NOT_FOUND');
    return found;
  }

  /** Repete a escrita enquanto outra escrita de horário passa na frente (`stale`). */
  async function retry<T>(attempt: number, write: () => Promise<T | 'stale'>): Promise<T> {
    const result = await write();
    if (result !== 'stale') return result;
    if (attempt >= ATTEMPTS) throw new Error('Schedule write kept conflicting with other writes');
    return retry(attempt + 1, write);
  }

  return {
    /** GRP-64: membros e reservas veem os horários, os arquivados também. */
    async list(userId: UserId, groupId: string): Promise<Schedule[]> {
      await requireMember(deps, userId, groupId);
      return (await deps.schedules.list(groupId)).schedules.map(publicSchedule);
    },

    /** GRP-64, 65: cria, sem sobrepor e até o limite do plano. */
    async create(userId: UserId, groupId: string, input: ScheduleInput): Promise<Schedule> {
      const group = await manager(userId, groupId);
      const data = ScheduleInputSchema.parse(input);
      await checkPlace(groupId, data.placeId);
      const at = now();
      const schedule = newEntity<Omit<StoredSchedule, 'version'>>(
        { ...data, groupId, updatedAt: at.toISOString() },
        at,
      );
      await retry(1, async () => {
        const revision = await checkOverlap(group, data);
        return (await deps.schedules.create(schedule, revision, max)) === 'created' ? true : 'stale';
      });
      return publicSchedule({ ...schedule, version: 1 });
    },

    /** GRP-66, 67: edita o horário inteiro, na versão; os jogos que já são item ficam como estão (GRP-10). */
    async update(
      userId: UserId,
      groupId: string,
      scheduleId: string,
      input: UpdateScheduleInput,
    ): Promise<Schedule> {
      const group = await manager(userId, groupId);
      const { version, ...data } = UpdateScheduleInputSchema.parse(input);
      const current = await mustGet(groupId, scheduleId);
      await checkPlace(groupId, data.placeId);
      // GRP-66: as vagas do horário não descem abaixo de quem está dentro do próximo jogo dele (GRP-45).
      const before = current.slots ?? group.slots;
      const after = data.slots ?? group.slots;
      const plan = before !== after ? await games.defaultsPlan(group, after, scheduleId) : undefined;
      const saved = await retry(1, async () => {
        const revision = current.archivedAt
          ? (await deps.schedules.list(groupId)).revision
          : await checkOverlap(group, data, scheduleId);
        return deps.schedules.update(groupId, scheduleId, data, version, revision);
      });
      if (plan) {
        const updated = await deps.groups.get(groupId, { consistent: true });
        if (updated) await plan.afterUpdate(updated, userId);
      }
      return publicSchedule(saved);
    },

    /** GRP-67: arquiva (o último ativo não) e cancela o próximo jogo dele, com o aviso (GRP-24). */
    async archive(
      userId: UserId,
      groupId: string,
      scheduleId: string,
      { version }: VersionInput,
    ): Promise<Schedule> {
      const group = await manager(userId, groupId);
      const current = await mustGet(groupId, scheduleId);
      if (current.archivedAt) return publicSchedule(current);
      const archived = await deps.schedules.archive(groupId, scheduleId, version, now().toISOString());
      // Com o grupo lido antes de arquivar: o horário ainda está entre os ativos, e o próximo jogo dele aparece.
      await games.cancelForSchedule(group, scheduleId, userId);
      return publicSchedule(archived);
    },

    /** GRP-67: volta, sem sobrepor e até o limite. */
    async unarchive(
      userId: UserId,
      groupId: string,
      scheduleId: string,
      { version }: VersionInput,
    ): Promise<Schedule> {
      const group = await manager(userId, groupId);
      const current = await mustGet(groupId, scheduleId);
      if (!current.archivedAt) return publicSchedule(current);
      const saved = await retry(1, async () => {
        const revision = await checkOverlap(group, current, scheduleId);
        return deps.schedules.unarchive(groupId, scheduleId, version, revision, max);
      });
      return publicSchedule(saved);
    },
  };
}
export type ScheduleService = ReturnType<typeof createScheduleService>;
