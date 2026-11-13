import { appError } from '@scorely/api/src/lib/errors';
import type { UserId } from '@scorely/api/src/lib/ids';
import type { GroupRepository, StoredGroup } from '@scorely/api/src/modules/groups/group.repository';
import { requireActive, requireMember } from '@scorely/api/src/modules/groups/groups.deps';
import type { GuestRoster, RosterAttendee, RosterGame } from '@scorely/api/src/modules/groups/roster';
import type { NotificationService } from '@scorely/api/src/modules/notifications/notification.service';
import { draw, drawWithRules } from '@scorely/api/src/modules/teams/engine/draw';
import {
  precheck,
  type RulePeople,
  type RulePerson,
  type TeamRuleConflict,
  type TeamViolation,
  violations,
} from '@scorely/api/src/modules/teams/engine/rules';
import type { PlayerRepository } from '@scorely/api/src/modules/teams/player.repository';
import { canManageTeams } from '@scorely/api/src/modules/teams/player.service';
import type { TeamSettingsRepository } from '@scorely/api/src/modules/teams/settings.repository';
import { settingsOf, type TeamConfig } from '@scorely/api/src/modules/teams/settings.service';
import type { StoredTeams, TeamsRepository } from '@scorely/api/src/modules/teams/teams.repository';
import type { UserDirectory } from '@scorely/api/src/modules/users/user.repository';
import {
  type TeamRuleConflict as ContractRuleConflict,
  type TeamViolation as ContractViolation,
  type GroupRole,
  type PlayerPosition,
  type PublicUserId,
  type SaveTeamsInput,
  SPORT_POSITIONS,
  type TeamExtra,
  type TeamGenders,
  type TeamPlayer,
  type Teams,
  type TeamsResponse,
} from '@scorely/contracts';

/** O que os times do jogo usam do módulo de grupos, das posições, dos usuários e dos avisos. */
export interface TeamsServiceDeps {
  groups: GroupRepository;
  roster: {
    /**
     * Jogo atual com a lista e os dois ids de cada pessoa (= `GameService.currentRoster`); responde `GROUP_ARCHIVED`
     * com o grupo arquivado.
     */
    currentGame(userId: UserId, groupId: string): Promise<RosterGame>;
    /** Jogo atual pelo link do jogo (= `GameService.guestRoster`, GRP-09). */
    guestView(userId: UserId, token: string): Promise<GuestRoster>;
  };
  /** Posições do grupo (TIM-04). */
  players: Pick<PlayerRepository, 'getMany'>;
  /** Nome e id público de quem saiu da lista (TIM-12), o gênero para as regras (TIM-18) e a tradução da entrada (USR-17). */
  users: Pick<UserDirectory, 'getMany' | 'resolve'>;
  /** Configuração de times do grupo (TIM-17). */
  settings: Pick<TeamSettingsRepository, 'get'>;
  notifications: Pick<NotificationService, 'notify'>;
  teams: TeamsRepository;
  now?: () => Date;
  /** Acaso do sorteio (TIM-15), em [0, 1). Não é de segurança. */
  random?: () => number;
}

const NONE: TeamsResponse = { teams: null };

/** "06/11" a partir de "2026-11-06" (texto do aviso em pt-BR, NTF-03). */
function dayMonth(date: string): string {
  const [, month, day] = date.split('-');
  return `${day}/${month}`;
}

export function createTeamsService(deps: TeamsServiceDeps) {
  const now = deps.now ?? (() => new Date());
  const random = deps.random ?? Math.random;

  /** TIM-07: só o dono escreve (404 para quem não participa, 403 para quem não é dono), e o grupo ativo (TIM-11). */
  async function requireManager(userId: UserId, groupId: string): Promise<StoredGroup> {
    const { group } = await requireMember(deps, userId, groupId);
    if (!canManageTeams(group, userId)) throw appError('GROUP_NOT_OWNER');
    requireActive(group);
    return group;
  }

  /** TIM-06: só o jogo atual. */
  async function currentGame(userId: UserId, groupId: string, date: string): Promise<RosterGame> {
    const game = await deps.roster.currentGame(userId, groupId);
    if (game.date !== date) throw appError('GAME_NOT_FOUND');
    return game;
  }

  /** TIM-11: com o jogo cancelado não se mexe nos times. */
  async function writableGame(userId: UserId, groupId: string, date: string): Promise<RosterGame> {
    const game = await currentGame(userId, groupId, date);
    if (game.status === 'cancelled') throw appError('GAME_CANCELLED');
    return game;
  }

  /** O papel de quem saiu da lista (TIM-12): o do grupo, se ainda participa; senão, convidado. */
  async function roleOutsideList(groupId: string, userId: UserId): Promise<GroupRole> {
    return (await deps.groups.roleOf(groupId, userId)) ?? 'guest';
  }

  /** TIM-17: a configuração do grupo (ou o padrão). */
  async function settingsFor(groupId: string): Promise<TeamConfig> {
    return settingsOf(await deps.settings.get(groupId));
  }

  /**
   * TIM-18, 24: quem conta para as regras, entre `ids`: só quem está na lista (dentro ou fila), com a principal no jogo
   * (o ajuste do jogo, TIM-13, ou a do grupo) e o gênero do perfil; e os avulsos do jogo, com os deles.
   */
  async function rulePeople(
    groupId: string,
    game: RosterGame,
    stored: Pick<StoredTeams, 'positions' | 'extras'>,
    ids: readonly string[],
  ): Promise<RulePeople> {
    const listed = new Set<string>([...game.confirmed, ...game.waitlist].map((a) => a.userId));
    const extras = new Map((stored.extras ?? []).map((e) => [e.id, e]));
    const unique = [...new Set(ids)];
    const inList = unique.filter((id) => listed.has(id) && !extras.has(id)) as UserId[];
    const [defaults, users] = await Promise.all([
      deps.players.getMany(groupId, inList),
      deps.users.getMany(inList),
    ]);
    const groupPositions = new Map(defaults.map((p) => [p.userId, p.positions]));
    const genders = new Map(users.map((u) => [u.id, u.gender]));
    const person = (position: PlayerPosition | undefined, gender: RulePerson['gender']): RulePerson => ({
      ...(position && { position }),
      ...(gender && { gender }),
    });
    const fromList = inList.map((id): [string, RulePerson] => [
      id,
      person((stored.positions[id] ?? groupPositions.get(id))?.[0], genders.get(id)),
    ]);
    const fromExtras = unique.flatMap((id): [string, RulePerson][] => {
      const extra = extras.get(id);
      return extra ? [[id, person(extra.positions[0], extra.gender)]] : [];
    });
    return new Map([...fromList, ...fromExtras]);
  }

  /** TIM-20, 22: o que está fora das regras (de quantidade e de times opostos) em cada time. */
  async function violationsOf(
    groupId: string,
    game: RosterGame,
    stored: StoredTeams,
    config: TeamConfig,
  ): Promise<TeamViolation[]> {
    if (config.rules.length === 0 && config.apart.length === 0) return [];
    const people = await rulePeople(groupId, game, stored, stored.teams.flat());
    return violations(stored.teams, config.rules, people, config.apart);
  }

  /** TIM-23: homens e mulheres de cada time (quem conta para as regras e informou o gênero). */
  async function gendersOf(groupId: string, game: RosterGame, stored: StoredTeams): Promise<TeamGenders[]> {
    const people = await rulePeople(groupId, game, stored, stored.teams.flat());
    const count = (team: string[], gender: 'M' | 'F') =>
      team.filter((id) => people.get(id)?.gender === gender).length;
    return stored.teams.map((team) => ({ M: count(team, 'M'), F: count(team, 'F') }));
  }

  /**
   * USR-16: id do sistema → id público, para quem aparece na resposta. Quem está na lista já vem com o público; o
   * resto (quem saiu da lista, TIM-12) é lido do perfil. Os avulsos ficam de fora: saem com o id deles.
   */
  async function publicIdsOf(game: RosterGame, ids: readonly UserId[]): Promise<Map<string, PublicUserId>> {
    const listed = new Map<string, PublicUserId>(
      [...game.confirmed, ...game.waitlist].map((a) => [a.userId, a.publicId]),
    );
    const missing = [...new Set(ids)].filter((id) => !listed.has(id));
    const users = missing.length > 0 ? await deps.users.getMany(missing) : [];
    return new Map([...listed, ...users.map((u) => [u.id, u.publicId] as const)]);
  }

  /** Troca uma pessoa pelo id público; sem ele, é dado inconsistente (bug), não um caso previsto. */
  function publicOf(map: ReadonlyMap<string, PublicUserId>, id: string): PublicUserId {
    const found = map.get(id);
    if (!found) throw new Error('Team person without a public id');
    return found;
  }

  /** USR-16: as violações saem com as pessoas pelo id público. */
  function publicViolations(
    list: readonly TeamViolation[],
    map: ReadonlyMap<string, PublicUserId>,
  ): ContractViolation[] {
    return list.map((v) =>
      v.kind === 'apart' ? { ...v, people: v.people.map((id) => publicOf(map, id)) } : v,
    );
  }

  /** USR-16: os conflitos do sorteio saem com as pessoas pelo id público. */
  function publicConflicts(
    list: readonly TeamRuleConflict[],
    map: ReadonlyMap<string, PublicUserId>,
  ): ContractRuleConflict[] {
    return list.map((c) => ('people' in c ? { ...c, people: c.people.map((id) => publicOf(map, id)) } : c));
  }

  /** Só as pessoas de uma lista de ids internos (sem os avulsos). */
  function peopleIn(ids: readonly string[], extras: ReadonlySet<string>): UserId[] {
    return ids.filter((id) => !extras.has(id)) as UserId[];
  }

  /**
   * Monta a resposta: posições valendo no jogo (TIM-13), quem saiu da lista (TIM-12), os avulsos (TIM-24), "H · M"
   * por time com a preferência ligada (TIM-23) e, só para o dono (`owner`), "sem time" e o que está fora das regras
   * (TIM-20).
   */
  async function view(
    groupId: string,
    game: RosterGame,
    stored: StoredTeams,
    config: TeamConfig,
    owner = false,
  ): Promise<Teams> {
    const forOwner = owner;
    const inList = new Map<string, { attendee: RosterAttendee; bench: boolean }>([
      ...game.confirmed.map((a) => [a.userId, { attendee: a, bench: false }] as const),
      ...game.waitlist.map((a) => [a.userId, { attendee: a, bench: true }] as const),
    ]);
    const extras = new Map((stored.extras ?? []).map((e) => [e.id, e]));
    const placed = new Set(stored.teams.flat());
    const pinned = new Set(forOwner ? (stored.pinned ?? []) : []);
    const unassigned = forOwner
      ? [...game.confirmed.map((a) => a.userId), ...extras.keys()].filter((id) => !placed.has(id))
      : [];
    const everyone = peopleIn([...placed, ...unassigned], new Set(extras.keys()));
    const missing = everyone.filter((id) => !inList.has(id));

    const [defaults, users, roles, outside, genders] = await Promise.all([
      deps.players.getMany(groupId, everyone),
      deps.users.getMany(missing),
      Promise.all(missing.map(async (id) => [id, await roleOutsideList(groupId, id)] as const)),
      owner ? violationsOf(groupId, game, stored, config) : [],
      config.spreadGender ? gendersOf(groupId, game, stored) : undefined,
    ]);
    const groupPositions = new Map(defaults.map((p) => [p.userId, p.positions]));
    const names = new Map(users.map((u) => [u.id, u.name]));
    const outsideRoles = new Map<string, GroupRole>(roles);
    const publicIds = new Map<string, PublicUserId>([
      ...[...inList.values()].map(({ attendee }) => [attendee.userId, attendee.publicId] as const),
      ...users.map((u) => [u.id, u.publicId] as const),
    ]);

    /** TIM-24: o avulso, sempre "na lista"; o gênero dele só para o dono editar. */
    const extraPerson = (extra: TeamExtra): TeamPlayer => ({
      userId: extra.id,
      name: extra.name,
      role: 'guest',
      positions: extra.positions,
      adjusted: false,
      inList: true,
      bench: false,
      pinned: pinned.has(extra.id),
      extra: true,
      ...(forOwner && extra.gender && { gender: extra.gender }),
    });

    const person = (userId: string): TeamPlayer => {
      const extra = extras.get(userId);
      if (extra) return extraPerson(extra);
      const adjusted = stored.positions[userId];
      const listed = inList.get(userId);
      const name = listed ? listed.attendee.name : names.get(userId as UserId);
      return {
        // USR-16: a pessoa sai pelo id público.
        userId: publicOf(publicIds, userId),
        ...(name && { name }),
        role: listed ? listed.attendee.role : (outsideRoles.get(userId) ?? 'guest'),
        positions: adjusted ?? groupPositions.get(userId) ?? [],
        adjusted: adjusted !== undefined,
        inList: listed !== undefined,
        bench: listed?.bench ?? false,
        pinned: pinned.has(userId),
        extra: false,
      };
    };

    return {
      groupId,
      date: stored.date,
      status: stored.status,
      teams: stored.teams.map((team) => team.map(person)),
      unassigned: unassigned.map(person),
      ...(stored.publishedAt && { publishedAt: stored.publishedAt }),
      ...(outside.length > 0 && { violations: publicViolations(outside, publicIds) }),
      ...(genders && { genders }),
    };
  }

  /**
   * TIM-08, 12, 13, 24: só quem está na lista (ou já estava nos times salvos) e os avulsos que vêm no próprio PUT;
   * posições do esporte. O id de um avulso não pode ser de alguém da lista (VALIDATION_ERROR), e um avulso que saiu
   * do PUT deixa de existir.
   */
  function validate(
    group: StoredGroup,
    game: RosterGame,
    existing: StoredTeams | undefined,
    input: SaveTeamsInput,
  ): void {
    const listed: string[] = [...game.confirmed, ...game.waitlist].map((a) => a.userId);
    const extras = input.extras ?? [];
    const extraIds = new Set(extras.map((e) => e.id));
    const oldExtras = new Set((existing?.extras ?? []).map((e) => e.id));
    const listedSet = new Set(listed);
    if (extras.some((e) => listedSet.has(e.id))) {
      throw appError('VALIDATION_ERROR', {
        issues: [
          { code: 'custom', path: ['extras'], message: 'An extra cannot use the id of someone in the list' },
        ],
      });
    }
    const allowed = new Set([
      ...listed,
      ...(existing?.teams.flat() ?? []).filter((id) => !oldExtras.has(id)),
      ...extraIds,
    ]);
    const referenced = [...input.teams.flat(), ...Object.keys(input.positions)];
    if (referenced.some((id) => !allowed.has(id))) throw appError('TEAM_PLAYER_NOT_FOUND');
    const sport: readonly PlayerPosition[] = SPORT_POSITIONS[group.sport];
    const invalid = [...Object.values(input.positions).flat(), ...extras.flatMap((e) => e.positions)].find(
      (p) => !sport.includes(p),
    );
    if (invalid) throw appError('TEAM_POSITION_INVALID', { position: invalid });
  }

  /**
   * USR-17: as pessoas do PUT chegam pelo id público e são guardadas pelo id do sistema; o avulso continua pelo id
   * dele. Id que não é avulso nem pessoa achada → TEAM_PLAYER_NOT_FOUND (o mesmo de quem não está na lista).
   */
  async function internalInput(input: SaveTeamsInput): Promise<SaveTeamsInput> {
    const extraIds = new Set((input.extras ?? []).map((e) => e.id));
    const referenced = [...input.teams.flat(), ...Object.keys(input.positions), ...(input.pinned ?? [])];
    const people = [...new Set(referenced.filter((id) => !extraIds.has(id)))] as PublicUserId[];
    const found = await deps.users.resolve(people);
    const internal = (id: string): string => {
      if (extraIds.has(id)) return id;
      const userId = found.get(id as PublicUserId);
      if (!userId) throw appError('TEAM_PLAYER_NOT_FOUND');
      return userId;
    };
    return {
      ...input,
      teams: input.teams.map((team) => team.map(internal)),
      positions: Object.fromEntries(Object.entries(input.positions).map(([id, p]) => [internal(id), p])),
      pinned: (input.pinned ?? []).map(internal),
    };
  }

  /**
   * TIM-15, 19, 22, 23: sem regras nem preferência, o sorteio da etapa 3; com elas, confere antes e cumpre todas as
   * regras (e espalha os gêneros, se ligado), ou TEAM_RULES_CONFLICT.
   */
  async function drawn(
    groupId: string,
    game: RosterGame,
    existing: StoredTeams | undefined,
    input: { teams: string[][]; pinned: string[]; pool: string[] },
    config: TeamConfig,
  ): Promise<string[][]> {
    const { rules, apart, spreadGender } = config;
    if (rules.length === 0 && apart.length === 0 && !spreadGender) return draw({ ...input, random });
    const fixed = new Set(input.pinned);
    const start = input.teams.map((team) => team.filter((id) => fixed.has(id)));
    const people = await rulePeople(groupId, game, existing ?? { positions: {} }, [
      ...start.flat(),
      ...input.pool,
    ]);
    const conflicts = precheck(start, input.pool, rules, people, apart);
    if (conflicts.length > 0) {
      const extras = new Set((existing?.extras ?? []).map((e) => e.id));
      const map = await publicIdsOf(game, peopleIn([...start.flat(), ...input.pool], extras));
      throw appError('TEAM_RULES_CONFLICT', { conflicts: publicConflicts(conflicts, map) });
    }
    const teams = drawWithRules({ ...input, random, rules, apart, spreadGender, people });
    if (!teams) throw appError('TEAM_RULES_CONFLICT', { conflicts: [{ reason: 'unsolvable' }] });
    return teams;
  }

  /** TIM-10: na 1ª publicação, avisa a lista (dentro e fila), menos o dono. */
  async function notifyPublished(group: StoredGroup, game: RosterGame): Promise<void> {
    const people = [...game.confirmed, ...game.waitlist].filter((a) => a.userId !== group.ownerId);
    await Promise.all(
      people.map((a) =>
        deps.notifications.notify(a.userId, {
          type: 'teams_published',
          title: 'Times publicados',
          body: `Os times de ${group.name} para ${dayMonth(game.date)} estão prontos.`,
          link: a.role === 'guest' && group.guestToken ? `/play/${group.guestToken}` : `/groups/${group.id}`,
        }),
      ),
    );
  }

  return {
    /** TIM-06, 09, 11–13: rascunho só para o dono; jogo cancelado (ou grupo arquivado, sem jogo) → sem times. */
    async get(userId: UserId, groupId: string, date: string): Promise<TeamsResponse> {
      const { group } = await requireMember(deps, userId, groupId);
      if (group.archivedAt) return NONE;
      const game = await currentGame(userId, groupId, date);
      if (game.status === 'cancelled') return NONE;
      const stored = await deps.teams.get(group.id, date);
      if (!canManageTeams(group, userId)) {
        if (stored?.status !== 'published') return NONE;
        return { teams: await view(group.id, game, stored, await settingsFor(group.id)) };
      }
      const settings = await settingsFor(group.id);
      if (!stored) return { teams: null, defaultTeamCount: settings.teamCount };
      return { teams: await view(group.id, game, stored, settings, true) };
    },

    /** TIM-06–08, 11–13: cria o rascunho ou substitui os times, sem mudar o status. */
    async save(
      userId: UserId,
      groupId: string,
      date: string,
      wireInput: SaveTeamsInput,
    ): Promise<TeamsResponse> {
      const group = await requireManager(userId, groupId);
      const game = await writableGame(userId, groupId, date);
      const existing = await deps.teams.get(group.id, date);
      const input = await internalInput(wireInput);
      validate(group, game, existing, input);
      const at = now().toISOString();
      const next: StoredTeams = {
        groupId: group.id,
        date,
        status: existing?.status ?? 'draft',
        teams: input.teams,
        positions: input.positions,
        pinned: input.pinned ?? [],
        ...(input.extras && input.extras.length > 0 && { extras: input.extras }),
        ...(existing?.publishedAt && { publishedAt: existing.publishedAt }),
        ...(existing?.rules && { rules: existing.rules }),
        ...(existing?.apart && { apart: existing.apart }),
        createdAt: existing?.createdAt ?? at,
        updatedAt: at,
      };
      await deps.teams.put(next);
      return { teams: await view(group.id, game, next, await settingsFor(group.id), true) };
    },

    /**
     * TIM-15, 16, 19: sorteia quem está dentro e quem veio do Banco para um time; os fixados ficam. Publicado volta para rascunho.
     * Com regras, cumpre todas ou responde TEAM_RULES_CONFLICT sem mudar nada.
     */
    async draw(userId: UserId, groupId: string, date: string): Promise<TeamsResponse> {
      const group = await requireManager(userId, groupId);
      const game = await writableGame(userId, groupId, date);
      const existing = await deps.teams.get(group.id, date);
      const settings = await settingsFor(group.id);
      const current = existing?.teams ?? Array.from({ length: settings.teamCount }, (): string[] => []);
      const placed = new Set(current.flat());
      const pinned = (existing?.pinned ?? []).filter((id) => placed.has(id));
      const fixed = new Set(pinned);
      const extras = existing?.extras ?? [];
      const pool = [
        ...game.confirmed.map((a) => a.userId),
        ...game.waitlist.map((a) => a.userId).filter((id) => placed.has(id)),
        ...extras.map((e) => e.id),
      ].filter((id) => !fixed.has(id));
      const teams = await drawn(group.id, game, existing, { teams: current, pinned, pool }, settings);
      const at = now().toISOString();
      const next: StoredTeams = {
        groupId: group.id,
        date,
        status: 'draft',
        teams,
        positions: existing?.positions ?? {},
        pinned,
        ...(extras.length > 0 && { extras }),
        ...(existing?.publishedAt && { publishedAt: existing.publishedAt }),
        rules: settings.rules,
        apart: settings.apart,
        createdAt: existing?.createdAt ?? at,
        updatedAt: at,
      };
      await deps.teams.put(next);
      return { teams: await view(group.id, game, next, settings, true) };
    },

    /** TIM-08–10: todo time com alguém; avisa só na 1ª publicação. */
    async publish(userId: UserId, groupId: string, date: string): Promise<TeamsResponse> {
      const group = await requireManager(userId, groupId);
      const game = await writableGame(userId, groupId, date);
      const existing = await deps.teams.get(group.id, date);
      if (!existing) throw appError('TEAM_EMPTY', { team: 1 });
      const empty = existing.teams.findIndex((team) => team.length === 0);
      if (empty >= 0) throw appError('TEAM_EMPTY', { team: empty + 1 });
      const settings = await settingsFor(group.id);
      if (!settings.allowOutsideRules) {
        const outside = await violationsOf(group.id, game, existing, settings);
        if (outside.length > 0) {
          const extras = new Set((existing.extras ?? []).map((e) => e.id));
          const map = await publicIdsOf(game, peopleIn(existing.teams.flat(), extras));
          throw appError('TEAM_RULES_VIOLATED', { violations: publicViolations(outside, map) });
        }
      }
      const at = now().toISOString();
      const next: StoredTeams = {
        ...existing,
        status: 'published',
        publishedAt: existing.publishedAt ?? at,
        updatedAt: at,
      };
      await deps.teams.put(next);
      if (!existing.publishedAt) await notifyPublished(group, game);
      return { teams: await view(group.id, game, next, settings, true) };
    },

    /** TIM-09: volta para rascunho (some para os outros). Sem times → nada muda. */
    async unpublish(userId: UserId, groupId: string, date: string): Promise<TeamsResponse> {
      const group = await requireManager(userId, groupId);
      const game = await writableGame(userId, groupId, date);
      const existing = await deps.teams.get(group.id, date);
      if (!existing) return NONE;
      const next: StoredTeams = { ...existing, status: 'draft', updatedAt: now().toISOString() };
      await deps.teams.put(next);
      return { teams: await view(group.id, game, next, await settingsFor(group.id), true) };
    },

    /** TIM-06: descarta os times do jogo. Sem times → nada muda. */
    async discard(userId: UserId, groupId: string, date: string): Promise<void> {
      const group = await requireManager(userId, groupId);
      await writableGame(userId, groupId, date);
      if (await deps.teams.get(group.id, date)) await deps.teams.delete(group.id, date);
    },

    /** TIM-09 / GRP-09: pelo link do jogo, só os times publicados (sem "sem time"). */
    async guestGet(userId: UserId, token: string): Promise<TeamsResponse> {
      const { group, game } = await deps.roster.guestView(userId, token);
      if (game.status === 'cancelled') return NONE;
      const stored = await deps.teams.get(group.id, game.date);
      if (stored?.status !== 'published') return NONE;
      return { teams: await view(group.id, game, stored, await settingsFor(group.id)) };
    },
  };
}

export type TeamsService = ReturnType<typeof createTeamsService>;
