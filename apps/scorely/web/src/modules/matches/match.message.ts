import type { Match, MatchEntry } from '@scorely/contracts';
import { formatDateTime } from '@scorely/web/src/lib/datetime';

// PAR-19: a mensagem da lista para colar no WhatsApp, em pt-BR, no fuso de quem copia (ADR 0006).

const entryName = (entry: MatchEntry) =>
  entry.kind === 'player'
    ? entry.user.nickname
    : `${entry.name} (convidado de ${entry.requestedBy.nickname})`;

const numbered = (names: readonly string[]) => names.map((name, i) => `${i + 1}. ${name}`);

export function matchMessage(
  match: Match,
  opts: { groupName: string; link: string; timeZone: string },
): string {
  const at = { timeZone: opts.timeZone, locale: 'pt-BR' as const };
  const weekday = formatDateTime(match.startsAt, 'weekdayShort', at).replace(/\.$/, '');
  const day = formatDateTime(match.startsAt, 'dayMonth', at);
  const time = formatDateTime(match.startsAt, 'time', at);
  const slots = match.teams * match.playersPerTeam;
  return [
    `${opts.groupName} · ${weekday}, ${day} às ${time}`,
    ...(match.note !== undefined ? [match.note] : []),
    '',
    `Confirmados (${match.in.length} de ${slots})`,
    ...numbered(match.in.map(entryName)),
    ...(match.queue.length > 0 ? ['Fila', ...numbered(match.queue.map(entryName))] : []),
    ...(match.notGoing.length > 0
      ? ['Não vão', ...numbered(match.notGoing.map((n) => n.user.nickname))]
      : []),
    '',
    `Confirme aqui: ${opts.link}`,
  ].join('\n');
}
