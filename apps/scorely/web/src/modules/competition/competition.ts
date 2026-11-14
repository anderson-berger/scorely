import {
  type AttendanceMark,
  COMPETITION_POINTS,
  COMPETITION_PRESETS,
  type Competition,
  type CompetitionGame,
  type CompetitionGameDetail,
  type CompetitionPoints,
  type CompetitionPresetId,
  type CompetitionRules,
  type Game,
  type GamePerson,
  type Match,
  type PersonGame,
  type RankingRow,
  type Season,
  type Tiebreak,
  type Trophy,
} from '@scorely/contracts';
import type { GroupAccess } from '@scorely/web/src/modules/groups/permissions';

/** Texto da tela: a chave do i18n e os parâmetros (a data já formatada vem de quem chama). */
export interface Text {
  key: string;
  params?: Record<string, string | number>;
}

/** A ordem dos 6 pontos na tela e no resumo (CMP-06). */
export const POINT_KEYS: (keyof CompetitionPoints)[] = [
  'win',
  'draw',
  'loss',
  'notConfirmed',
  'noShow',
  'cancelled',
];

/** Os pontos que entram no resumo da linha dos Ajustes (CMP-10): "V 3 · E 2 · D 1 · F −2". */
const SUMMARY_KEYS: (keyof CompetitionPoints)[] = ['win', 'draw', 'loss', 'noShow'];

/** CMP-09: a aba Competição aparece quando a competição não está desativada. */
export function showsCompetitionTab(c: Competition | undefined): boolean {
  return Boolean(c && c.status !== 'inactive');
}

/** CMP-10: a linha dos Ajustes: o dono sempre; `seasons.manage`, só com a competição já ativada alguma vez. */
export function showsCompetitionRow(c: Competition | undefined, access: GroupAccess): boolean {
  if (!c) return false;
  return access.owner || (access.seasons && c.status !== 'inactive');
}

/** CMP-07, 09: muda o regulamento quem tem `seasons.manage`, com a competição ativa e o grupo ativo. */
export function canEditRules(c: Competition | undefined, access: GroupAccess, archived: boolean): boolean {
  return Boolean(c && c.status === 'active' && access.seasons && !archived);
}

/** CMP-09, 10: "Teste até {date}", "Ativa até {date}", "Vencida em {date}" ou "Desativada". */
export function statusText(c: Competition, date: (iso: string) => string): Text {
  if (c.status === 'inactive' || !c.activeUntil) return { key: 'competition.status.inactive' };
  const params = { date: date(c.activeUntil) };
  if (c.status === 'expired') return { key: 'competition.status.expired', params };
  return { key: c.plan === 'paid' ? 'competition.status.paid' : 'competition.status.trial', params };
}

/** Número com o sinal de menos tipográfico ("−2"). */
export function signed(n: number): string {
  return n < 0 ? `−${Math.abs(n)}` : String(n);
}

/** CMP-10: os pares (letra, valor) do resumo; a letra vem do i18n (`competition.short.<key>`). */
export function pointsSummary(points: CompetitionPoints): { key: string; value: string }[] {
  return SUMMARY_KEYS.map((k) => ({ key: `competition.short.${k}`, value: signed(points[k]) }));
}

/**
 * Uma cópia do regulamento, campo a campo, para o rascunho do painel não mexer no original. Funciona também com o
 * Proxy reativo do Vue (o `structuredClone` recusa Proxy).
 */
export function copyRules(rules: CompetitionRules): CompetitionRules {
  return { points: { ...rules.points }, unit: rules.unit, tiebreak: [...rules.tiebreak] };
}

/** CMP-08: o modelo só preenche (uma cópia, para a edição não mexer no modelo). */
export function presetRules(id: CompetitionPresetId): CompetitionRules {
  return copyRules(COMPETITION_PRESETS[id]);
}

/** CMP-06: um valor de pontos andando um passo, preso na faixa. */
export function stepPoint(value: number, dir: 1 | -1): number {
  return Math.min(COMPETITION_POINTS.max, Math.max(COMPETITION_POINTS.min, value + dir));
}

/** CMP-06: inclui o critério no fim do desempate, ou tira se já está. */
export function toggleTiebreak(list: Tiebreak[], criterion: Tiebreak): Tiebreak[] {
  return list.includes(criterion) ? list.filter((c) => c !== criterion) : [...list, criterion];
}

/** CMP-06: sobe (−1) ou desce (+1) o critério na ordem; na ponta, nada muda. */
export function moveTiebreak(list: Tiebreak[], index: number, dir: 1 | -1): Tiebreak[] {
  const to = index + dir;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return list;
  return list.map((c, i) => (i === index ? list[to] : i === to ? list[index] : c)) as Tiebreak[];
}

// Fechar o jogo (CMP-11–18).

/** CMP-11, 17, 18: fecha e corrige quem tem `results.record`, com a competição ativa e o grupo ativo. */
export function canCloseGames(c: Competition | undefined, access: GroupAccess, archived: boolean): boolean {
  return Boolean(c && c.status === 'active' && access.results && !archived);
}

/** CMP-17: a linha Competição da aba Jogo: quem fecha, com o jogo atual já começado (inclusive cancelado). */
export function showsGameLine(
  c: Competition | undefined,
  access: GroupAccess,
  game: Pick<Game, 'status' | 'startsAt'> | null | undefined,
  archived: boolean,
  now: number,
): boolean {
  if (!game || !canCloseGames(c, access, archived)) return false;
  return game.status === 'in_progress' || (game.status === 'cancelled' && Date.parse(game.startsAt) <= now);
}

/** CMP-18: o estado do jogo na lista. */
export function gameStateText(g: Pick<CompetitionGame, 'state' | 'cancelled' | 'friendly'>): Text {
  if (g.state === 'closed') {
    if (g.cancelled) return { key: 'competition.games.state.closedCancelled' };
    return { key: g.friendly ? 'competition.games.state.friendly' : 'competition.games.state.closed' };
  }
  return {
    key: g.state === 'cancelled' ? 'competition.games.state.cancelled' : 'competition.games.state.open',
  };
}

/** CMP-18: o resultado do dia ("Time 2 venceu", "Empate" ou "Sem resultado"). */
export function resultText(detail: Pick<CompetitionGameDetail, 'cancelled' | 'winner'>): Text {
  if (detail.cancelled) return { key: 'competition.games.result.cancelled' };
  if (detail.winner === undefined) return { key: 'competition.games.result.none' };
  if (detail.winner === 'draw') return { key: 'competition.games.result.draw' };
  return { key: 'competition.games.result.team', params: { n: detail.winner + 1 } };
}

/** CMP-18: o que aconteceu com a pessoa ("veio · Time 2", "faltou", "não confirmou"), em partes do i18n. */
export function personParts(p: GamePerson): Text[] {
  const parts: Text[] = [];
  if (p.event === 'notConfirmed') parts.push({ key: 'competition.games.person.notConfirmed' });
  else if (p.event === 'cancelled') parts.push({ key: 'competition.games.person.inCancelled' });
  else if (p.inside === false && !p.attendance) parts.push({ key: 'competition.games.person.queue' });
  else if (p.attendance) parts.push({ key: `competition.games.person.${p.attendance}` });
  if (p.record) parts.push(recordText(p.record));
  if (p.team !== undefined) parts.push({ key: 'teams.teamName', params: { n: p.team + 1 } });
  return parts;
}

/** CMP-18: os pontos com sinal ("+3", "−2", "0"). */
export function pointsText(points: number): string {
  return points > 0 ? `+${points}` : signed(points);
}

/** CMP-12: o rascunho da chamada no painel: o que veio do jogo (fechado ou a sugerida) para quem está na lista. */
export function draftAttendance(
  detail: Pick<CompetitionGameDetail, 'people' | 'cancelled'>,
): Record<string, AttendanceMark> {
  if (detail.cancelled) return {};
  return Object.fromEntries(
    detail.people
      .filter((p) => p.inside !== undefined)
      .map((p) => [p.id, p.attendance ?? (p.inside ? 'present' : 'absent')]),
  );
}

// Partidas (CMP-20–23).

/** CMP-23: os times da partida nova: os da última partida; na 1ª, o Time 1 e o Time 2 publicados; senão, vazia. */
export function defaultMatchTeams(
  detail: Pick<CompetitionGameDetail, 'matches' | 'teams'>,
): [string[], string[]] {
  const last = detail.matches.at(-1);
  if (last) return [[...last.teams[0]], [...last.teams[1]]];
  return [[...(detail.teams[0] ?? [])], [...(detail.teams[1] ?? [])]];
}

/** CMP-23: as vitórias e as partidas de cada pessoa ("2 V / 3 P"), da que mais venceu para a que menos venceu. */
export function matchTally(matches: readonly Match[]): { id: string; wins: number; played: number }[] {
  const tally = new Map<string, { wins: number; played: number }>();
  for (const m of matches) {
    m.teams.forEach((side, i) => {
      for (const id of side) {
        const t = tally.get(id) ?? { wins: 0, played: 0 };
        tally.set(id, { wins: t.wins + (m.winner === i ? 1 : 0), played: t.played + 1 });
      }
    });
  }
  return [...tally].map(([id, t]) => ({ id, ...t })).sort((a, b) => b.wins - a.wins || b.played - a.played);
}

/** CMP-22: "3 V · 1 E · 1 D". */
export function recordText(record: { wins: number; draws: number; losses: number }): Text {
  return { key: 'competition.matches.record', params: { ...record } };
}

// Ranking e histórico (CMP-27, 28).

/** CMP-28: "1º" (o empate repete a posição). */
export function positionText(row: Pick<RankingRow, 'position'>): Text {
  return { key: 'competition.ranking.position', params: { n: row.position } };
}

/** CMP-28: "12 presenças · sequência 5". */
export function rankingLine(row: Pick<RankingRow, 'attendance' | 'streak'>): Text[] {
  return [
    { key: 'competition.ranking.attendance', params: { n: row.attendance } },
    { key: 'competition.ranking.streak', params: { n: row.streak } },
  ];
}

/** CMP-27: o que aconteceu com a pessoa no jogo ("veio · Time 2", "faltou", "3 V · 1 E · 1 D"). */
export function personGameParts(g: PersonGame): Text[] {
  const parts: Text[] = [];
  if (g.event === 'notConfirmed') parts.push({ key: 'competition.games.person.notConfirmed' });
  else if (g.event === 'cancelled') parts.push({ key: 'competition.games.person.inCancelled' });
  else if (g.attendance) parts.push({ key: `competition.games.person.${g.attendance}` });
  if (g.team !== undefined) parts.push({ key: 'teams.teamName', params: { n: g.team + 1 } });
  if (g.record) parts.push(recordText(g.record));
  if (g.friendly) parts.push({ key: 'competition.ranking.friendly' });
  return parts;
}

// Temporadas (CMP-29–35).

/** O nome da temporada: o dado, ou "Temporada N" (o texto é do web). */
export function seasonTitle(season: Pick<Season, 'name' | 'number'>): Text {
  return season.name
    ? { key: 'competition.seasons.named', params: { name: season.name } }
    : { key: 'competition.seasons.defaultName', params: { n: season.number } };
}

/** Dias entre duas datas locais (`b − a`). */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** A data local `n` dias depois. */
export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/**
 * CMP-35: a linha do card da temporada: "até 30/01 · faltam 10 dias", "começa 01/02", "fechar os jogos até 02/02" ou
 * "encerrada em 30/01". `date` formata a data local (`YYYY-MM-DD`).
 */
export function seasonStatusText(
  season: Pick<Season, 'state' | 'startDate' | 'endDate' | 'graceUntil'>,
  today: string,
  date: (local: string) => string,
  instant: (iso: string) => string,
): Text {
  if (season.state === 'scheduled')
    return { key: 'competition.seasons.status.scheduled', params: { date: date(season.startDate) } };
  if (season.state === 'open') {
    return {
      key: 'competition.seasons.status.open',
      params: { date: date(season.endDate), days: Math.max(0, daysBetween(today, season.endDate)) },
    };
  }
  if (season.state === 'grace')
    return { key: 'competition.seasons.status.grace', params: { date: instant(season.graceUntil) } };
  return { key: 'competition.seasons.status.closed', params: { date: date(season.endDate) } };
}

/** CMP-33, 35: a temporada que vale agora (aberta ou no prazo). */
export function currentSeason(seasons: readonly Season[]): Season | undefined {
  return seasons.find((s) => s.state === 'open' || s.state === 'grace');
}

/** CMP-33: o pódio na ordem das posições. */
export function podiumOf(season: Pick<Season, 'podium'>): RankingRow[] {
  return [...(season.podium ?? [])].sort((a, b) => a.position - b.position);
}

/** CMP-35: as datas que o painel sugere para abrir agora: de hoje a 3 meses. */
export function defaultSeasonDates(today: string): { startDate: string; endDate: string } {
  return { startDate: today, endDate: addDays(today, 90) };
}

// Prêmios (CMP-36–41).

/** CMP-41: "Campeão · Primavera · Vôlei de sexta" (o nome da temporada pode faltar: "Temporada N"). */
export function trophyText(trophy: Trophy): Text[] {
  return [
    { key: `competition.trophies.kind.${trophy.kind}` },
    seasonTitle({ name: trophy.seasonName, number: trophy.seasonNumber }),
    { key: 'competition.seasons.named', params: { name: trophy.groupName } },
  ];
}

/**
 * CMP-40: o texto pronto do pódio para compartilhar: "🏆 Primavera · Vôlei de sexta", "1º Ana · 2º Caio · 3º Dono e
 * Beatriz" e os destaques. `tr` traduz.
 */
export function shareText(season: Season, groupName: string, tr: (t: Text) => string): string {
  const byPosition = new Map<number, string[]>();
  for (const row of podiumOf(season)) {
    byPosition.set(row.position, [
      ...(byPosition.get(row.position) ?? []),
      row.name ?? tr({ key: 'groups.unnamed' }),
    ]);
  }
  const podium = [...byPosition]
    .map(
      ([position, names]) =>
        `${tr(positionText({ position }))} ${names.join(` ${tr({ key: 'competition.share.and' })} `)}`,
    )
    .join(' · ');
  const highlights = (season.highlights ?? []).map(
    (h) =>
      `${tr({ key: `competition.trophies.kind.${h.kind}` })}: ${h.rows.map((r) => r.name ?? tr({ key: 'groups.unnamed' })).join(', ')}`,
  );
  return [`🏆 ${tr(seasonTitle(season))} · ${groupName}`, podium, ...highlights].filter(Boolean).join('\n');
}
