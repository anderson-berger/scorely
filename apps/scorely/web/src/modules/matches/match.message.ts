import type { Match, MatchEntry, MatchTeamMember } from '@scorely/contracts';
import { formatDateTime } from '@scorely/web/src/lib/datetime';
import { slotsOf } from '@scorely/web/src/modules/matches/match.settings';

// PAR-19: as mensagens da lista e dos times para colar no WhatsApp, em pt-BR, no fuso de quem copia (ADR 0006).

interface MessageOptions {
  groupName: string;
  link: string;
  timeZone: string;
}

const entryName = (entry: MatchEntry) =>
  entry.kind === 'player'
    ? entry.user.nickname
    : `${entry.name} (convidado de ${entry.requestedBy.nickname})`;

const numbered = (names: readonly string[]) => names.map((name, i) => `${i + 1}. ${name}`);

/** "Pelada de sexta · sex, 27/11 às 19:00". */
function header(match: Match, opts: MessageOptions): string {
  const at = { timeZone: opts.timeZone, locale: 'pt-BR' as const };
  const weekday = formatDateTime(match.startsAt, 'weekdayShort', at).replace(/\.$/, '');
  const day = formatDateTime(match.startsAt, 'dayMonth', at);
  const time = formatDateTime(match.startsAt, 'time', at);
  return `${opts.groupName} · ${weekday}, ${day} às ${time}`;
}

export function matchMessage(match: Match, opts: MessageOptions): string {
  const slots = slotsOf(match);
  return [
    header(match, opts),
    '',
    slots === undefined ? `Confirmados (${match.in.length})` : `Confirmados (${match.in.length} de ${slots})`,
    ...numbered(match.in.map(entryName)),
    ...(match.queue.length > 0 ? ['Fila', ...numbered(match.queue.map(entryName))] : []),
    ...(match.notGoing.length > 0
      ? ['Não vão', ...numbered(match.notGoing.map((n) => n.user.nickname))]
      : []),
    '',
    `Confirme aqui: ${opts.link}`,
  ].join('\n');
}

const memberName = (member: MatchTeamMember) =>
  member.kind === 'player' ? member.user.nickname : member.name;

/** PAR-19: os times salvos, sem quem saiu da lista e com o convidado só pelo nome. */
export function teamsMessage(match: Match, opts: MessageOptions): string {
  const teams = match.lineup?.list ?? [];
  return [
    header(match, opts),
    '',
    ...teams.flatMap((team, i) => [
      `Time ${i + 1}`,
      ...numbered(team.filter((m) => !m.left).map(memberName)),
    ]),
    '',
    `Partida: ${opts.link}`,
  ].join('\n');
}
