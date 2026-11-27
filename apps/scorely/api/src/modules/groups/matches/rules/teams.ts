// Times (PAR-25–29): salvar a divisão e mostrar os times salvos.
import { appError } from '@scorely/api/src/lib/errors';
import type { UserId } from '@scorely/api/src/lib/ids';
import type {
  StoredGuest,
  StoredTeamPlayer,
  StoredTeams,
} from '@scorely/api/src/modules/groups/matches/data/matches.repository';
import type { MatchContext, MatchState } from '@scorely/api/src/modules/groups/matches/matches.service';
import type { LineupItem } from '@scorely/api/src/modules/groups/matches/rules/attendance';
import { parseOrFail } from '@scorely/api/src/modules/groups/matches/rules/matches';
import {
  type Match,
  type MatchEntry,
  type MatchLineup,
  type MatchTeamMember,
  type MatchTeamPlayerOut,
  type MatchTeamPlayerRef,
  type PublicGroupId,
  type PublicUserId,
  type SaveMatchTeamsInput,
  SaveMatchTeamsInputSchema,
  type User,
} from '@scorely/contracts';

/** PAR-27, 35: de quem as pessoas precisam do perfil: quem tem conta e quem trouxe cada convidado. */
export function playersPeople(
  players: readonly StoredTeamPlayer[],
  guests: readonly StoredGuest[],
): UserId[] {
  const byId = new Map(guests.map((g) => [g.id, g]));
  return players.flatMap((p) => {
    if (p.kind === 'user') return [p.id as UserId];
    const guest = byId.get(p.id);
    return guest ? [guest.requestedBy] : [];
  });
}

/** PAR-27: de quem os times salvos precisam do perfil. */
export const teamPeople = (saved: StoredTeams | undefined, guests: readonly StoredGuest[]) =>
  playersPeople(saved?.teams.flat() ?? [], guests);

export const playerKey = (p: { kind: string; id: string }) => `${p.kind}:${p.id}`;

/**
 * PAR-25, 33, 34: traduz as pessoas da entrada (id público) para as do banco (`UserId`), aceitando só quem está em
 * `allowed`. Quem não está vai em `out` (sem repetir).
 */
export function refResolver(allowed: readonly LineupItem[], people: Map<UserId, User>) {
  const users = new Map(
    allowed.flatMap((i) => {
      const user = i.kind === 'player' ? people.get(i.userId) : undefined;
      return i.kind === 'player' && user ? [[user.id as string, i.userId] as const] : [];
    }),
  );
  const guests = new Set(allowed.flatMap((i) => (i.kind === 'guest' ? [i.id] : [])));
  const isAllowed = (p: MatchTeamPlayerRef) => (p.kind === 'user' ? users.has(p.id) : guests.has(p.id));
  return {
    stored: (p: MatchTeamPlayerRef): StoredTeamPlayer => ({
      kind: p.kind,
      id: p.kind === 'user' ? (users.get(p.id) ?? p.id) : p.id,
    }),
    out: (refs: readonly MatchTeamPlayerRef[]): MatchTeamPlayerRef[] => {
      const seen = new Map(refs.filter((p) => !isAllowed(p)).map((p) => [playerKey(p), p]));
      return [...seen.values()];
    },
  };
}

/**
 * PAR-27, 28: os times salvos, cada pessoa com a marca de quem não está mais dentro, e quem está dentro sem time
 * à parte, na ordem da lista. Quem não tem mais perfil, o convidado que não existe ou o convidado de quem não tem
 * mais perfil fica no lugar como `gone` ("Pessoa removida", sempre com `left`).
 */
export function lineupView(
  saved: StoredTeams,
  state: MatchState,
  people: Map<UserId, User>,
  entry: (item: LineupItem) => MatchEntry,
): MatchLineup {
  const inside = new Set(state.list.in.map((i) => `${i.kind === 'player' ? 'user' : 'guest'}:${i.id}`));
  const guests = new Map(state.guests.map((g) => [g.id, g]));
  const gone: MatchTeamMember = { kind: 'gone', left: true };
  const member = (p: StoredTeamPlayer): MatchTeamMember => {
    const left = !inside.has(`${p.kind}:${p.id}`);
    if (p.kind === 'user') {
      const user = people.get(p.id as UserId);
      const tier = state.participants.get(p.id as UserId)?.tier;
      return user ? { kind: 'player', user, ...(tier !== undefined && { tier }), left } : gone;
    }
    const guest = guests.get(p.id);
    const by = guest && people.get(guest.requestedBy);
    return guest && by ? { kind: 'guest', guestId: guest.id, name: guest.name, requestedBy: by, left } : gone;
  };
  const placed = new Set(saved.teams.flat().map((p) => `${p.kind}:${p.id}`));
  return {
    list: saved.teams.map((team) => team.map(member)),
    unassigned: state.list.in
      .filter((i) => !placed.has(`${i.kind === 'player' ? 'user' : 'guest'}:${i.id}`))
      .map(entry),
    version: saved.version,
  };
}

export function teamsRules(ctx: MatchContext) {
  const { deps, now } = ctx;

  /**
   * PAR-25: quem saiu, com o nome achado aqui (apelido de quem tem conta, nome do convidado em qualquer situação),
   * mesmo de quem a tela nunca teve. Sem perfil ou sem registro, vai sem `name`.
   */
  async function namedOut(
    out: readonly MatchTeamPlayerRef[],
    guests: readonly StoredGuest[],
  ): Promise<MatchTeamPlayerOut[]> {
    const publicIds = out.flatMap((p) => (p.kind === 'user' ? [p.id] : []));
    const ids = publicIds.length > 0 ? await deps.users.resolve(publicIds) : new Map<PublicUserId, UserId>();
    const people = await ctx.profiles([...ids.values()]);
    const guestNames = new Map(guests.map((g) => [g.id, g.name]));
    return out.map((p) => {
      const name = p.kind === 'user' ? people.get(ids.get(p.id) as UserId)?.nickname : guestNames.get(p.id);
      return name === undefined ? p : { ...p, name };
    });
  }

  /** PAR-25, 28, 29: salvar os times (troca a divisão inteira). O primeiro salvar avisa quem está num time. */
  async function saveTeams(
    userId: UserId,
    publicId: PublicGroupId,
    matchId: string,
    input: SaveMatchTeamsInput,
  ): Promise<Match> {
    const access = await deps.groups.access(userId, publicId);
    ctx.requireManage(access);
    const match = await ctx.load(access.groupId, matchId);
    const at = now();
    if (match.cancelledAt !== undefined) throw appError('MATCH_CANCELLED');
    if (match.finishedAt !== undefined) throw appError('MATCH_FINISHED');
    const parsed = parseOrFail(SaveMatchTeamsInputSchema, input);
    const state = await ctx.stateOf(match, true);
    // PAR-25: só quem está dentro.
    const people = await ctx.profiles(state.list.in.flatMap((i) => (i.kind === 'player' ? [i.userId] : [])));
    const resolver = refResolver(state.list.in, people);
    const out = resolver.out(parsed.teams.flat());
    if (out.length > 0)
      throw appError('MATCH_TEAM_PLAYER_OUT', { players: await namedOut(out, state.guests) });
    const teams = parsed.teams.map((team) => team.map(resolver.stored));
    const result = await deps.matches.saveTeams({
      groupId: access.groupId,
      matchId,
      teams,
      by: userId,
      at,
      expectedVersion: parsed.expectedVersion,
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
            body: `Os times da partida de ${access.name} saíram.`,
            link: ctx.linkOf(access, matchId),
          }),
        ),
      );
    }
    return ctx.view(access, userId, match, true);
  }

  return { namedOut, saveTeams };
}
