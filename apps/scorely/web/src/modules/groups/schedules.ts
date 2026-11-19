import type { Schedule } from '@scorely/contracts';

/** GRP-64: um horário em texto, com o dia já traduzido ("Ter 19:00–21:00"). */
export function scheduleText(schedule: Pick<Schedule, 'start' | 'end'>, weekday: string): string {
  return `${weekday} ${schedule.start}–${schedule.end}`;
}

/** GRP-64: os horários ativos, por dia e início (a api já manda nessa ordem; os arquivados ficam de fora). */
export function activeSchedules<T extends Pick<Schedule, 'weekday' | 'start' | 'archivedAt'>>(
  schedules: T[],
): T[] {
  return schedules
    .filter((s) => !s.archivedAt)
    .sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start));
}
