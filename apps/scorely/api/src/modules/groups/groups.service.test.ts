import { randomUUID } from 'node:crypto';
import {
  type CreateGroupInput,
  CreateGroupInputSchema,
  type ErrorCode,
  GameSchema,
  type Group,
  GroupLayersSchema,
  GroupSchema,
  GuestGameSchema,
  type InviteKind,
  InviteSchema,
  MemberInviteSchema,
  type MemberRole,
  MyGroupSchema,
  type Notification,
  UpdateGroupInputSchema,
  type User,
} from '@scorely/contracts';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../lib/errors';
import type { NewNotification } from '../notifications/notification.service';
import type { AttendanceRecord, GameRecord, GameRepository } from './game.repository';
import { createGameService } from './game.service';
import type { GroupRepository, RemoveMemberResult, StoredGroup } from './group.repository';
import { createGroupService } from './group.service';

// Plano 003, bloco 2: casos 1, 2, 3 (api), 4 (service), 5, 6, 7, 8, 10–13 e a corrida na criação do jogo (tarefa 6a).
// Plano 006: casos 11–13 (remoção de membro com `not_member`/`stale`).
// Plano 007 (E2): casos 1–15 (reservas, link do jogo e camadas).
// Plano 013 (Membership): casos 1–16, no fim do arquivo; o repositório em memória já está no formato novo.

type ReadOpts = { consistent?: boolean };
type Stored = StoredGroup;
type RemoveArgs = Parameters<GroupRepository['removeMember']>[0];
type GroupPatch = Parameters<GroupRepository['update']>[1];
type ArchiveResult = Awaited<ReturnType<GroupRepository['archive']>>;
type UnarchiveArgs = { group: Stored; tokens: Parameters<GroupRepository['unarchive']>[1] };
type UnarchiveResult = Awaited<ReturnType<GroupRepository['unarchive']>>;
/** Participação no fake (plano 013, D2): o `MembershipRecord` sem `groupId`, que é a chave do mapa. */
type MembershipRow = {
  userId: string;
  role: MemberRole;
  createdAt: string;
  roleChangedAt?: string;
  /** Prazo do convite para membro pendente (GRP-40), campo da própria participação. */
  memberInviteExpiresAt?: string;
};
type AddMemberResult = 'added' | 'promoted' | 'unchanged' | 'members_full' | 'reserves_full' | 'stale';
type AcceptInviteResult = 'promoted' | 'invalid' | 'members_full' | 'stale';
const DAY = 24 * 60 * 60 * 1000;

const MINUTE = 60 * 1000;
const iso = (value: string | Date) => new Date(value).toISOString();

/** Quinta 2026-11-05 10:00 em São Paulo. */
const THURSDAY_10H = new Date('2026-11-05T13:00:00.000Z');
/** Quinta 2026-11-05 19:00 em São Paulo (24 h antes do jogo: abertura das reservas por padrão). */
const THURSDAY_19H = new Date('2026-11-05T22:00:00.000Z');
/** Sexta 2026-11-06 13:00 em São Paulo (6 h antes do jogo). */
const FRIDAY_13H = new Date('2026-11-06T16:00:00.000Z');
/** Sexta 2026-11-06 20:00 em São Paulo (jogo de 19h em andamento). */
const FRIDAY_20H = new Date('2026-11-06T23:00:00.000Z');
/** Sexta 2026-11-06 22:01 em São Paulo (passou a janela de 3 h). */
const FRIDAY_22H01 = new Date('2026-11-07T01:01:00.000Z');
/** Quarta 2026-11-04 19:00 em São Paulo (48 h antes: abertura dos membros). */
const WEDNESDAY_19H = new Date('2026-11-04T22:00:00.000Z');
const DATE = '2026-11-06';
const NEXT_DATE = '2026-11-13';

const OWNER = '11111111-1111-4111-8111-111111111111';
const A = '22222222-2222-4222-8222-222222222222';
const B = '33333333-3333-4333-8333-333333333333';
const C = '44444444-4444-4444-8444-444444444444';
const D = '55555555-5555-4555-8555-555555555555';
const OUTSIDER = '66666666-6666-4666-8666-666666666666';
const LISBON_OWNER = '77777777-7777-4777-8777-777777777777';
/** Reserva (entra pelo link de reserva). */
const R = '88888888-8888-4888-8888-888888888888';
/** Convidado (só pelo link do jogo). */
const G = '99999999-9999-4999-8999-999999999999';

const user = (id: string, extra: Partial<User> = {}): User => ({
  id,
  email: `${id.slice(0, 4)}@example.com`,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...extra,
});

const USERS: User[] = [
  user(OWNER, { name: 'Dono' }),
  user(A, { name: 'Ana' }),
  user(B, { name: 'Beatriz', nickname: 'Bia' }),
  user(C, { name: 'Caio' }),
  user(D, { name: 'Duda' }),
  user(OUTSIDER, { name: 'Fora' }),
  user(LISBON_OWNER, { name: 'Lis', timeZone: 'Europe/Lisbon' }),
  user(R, { name: 'Rafa' }),
  user(G, { name: 'Gabi' }),
];

const BASE_INPUT: CreateGroupInput = {
  name: 'Vôlei de sexta',
  sport: 'volleyball',
  weekday: 5,
  time: '19:00',
  slots: 12,
  listOpensHoursBefore: 48,
};
const INPUT: CreateGroupInput = { ...BASE_INPUT, timeZone: 'America/Sao_Paulo' };

const KINDS: InviteKind[] = ['member', 'reserve', 'guest'];
/** Campo do grupo com o token de cada tipo de link (plano 007, D5). */
const TOKEN_FIELD = { member: 'inviteToken', reserve: 'reserveInviteToken', guest: 'guestToken' } as const;

/**
 * Repositórios em memória com o estado compartilhado (o `removeMember` do grupo apaga a presença do jogo, D12).
 * Participações no formato do plano 013: uma `Membership` por (grupo, usuário), com `role`, `createdAt` (data de
 * entrada, nunca muda) e `roleChangedAt` (reserva → membro). Como no Dynamo, `listMembers` e `groupsOf` voltam na
 * ordem da chave (userId / groupId), não na de entrada: quem ordena a lista é o service (D4, D9).
 * O papel de um token sai de qual campo do grupo ele ocupa (D5 do 007).
 * O `get` devolve o grupo como foi gravado (grupo antigo continua sem os campos da E2, D3).
 * `race.stale`: a próxima leitura não consistente do jogo por data não enxerga nada (simula a corrida do D2).
 */
function memoryStore(now: () => Date = () => new Date()) {
  const groups = new Map<string, Stored>();
  const memberships = new Map<string, Map<string, MembershipRow>>();
  const games = new Map<string, GameRecord>();
  const gameByDate = new Map<string, string>();
  const attendance = new Map<string, AttendanceRecord>();
  const race = { stale: false };
  const findByDateReads: (ReadOpts | undefined)[] = [];
  /** Leituras do repositório de grupos (plano 013, D7: "meus grupos" sem `get`/`roleOf` por grupo). */
  const reads = { get: 0, roleOf: 0, groupsOf: 0 };
  /** Chamadas ao `removeMember` do repositório (cópia do grupo recebido). */
  const removeCalls: RemoveArgs[] = [];
  /** Respostas forçadas do `removeMember`, consumidas na ordem (plano 006); vazia → comportamento normal. */
  const removeScript: ((args: RemoveArgs) => RemoveMemberResult)[] = [];
  /** Chamadas ao `archive`/`unarchive` do repositório (GRP-31, GRP-33). */
  const archiveCalls: { group: Stored; archivedAt: string }[] = [];
  const unarchiveCalls: UnarchiveArgs[] = [];
  /** Respostas forçadas do `archive`/`unarchive`, consumidas na ordem; vazia → comportamento normal. */
  const archiveScript: ((group: Stored, archivedAt: string) => ArchiveResult)[] = [];
  const unarchiveScript: ((args: UnarchiveArgs) => UnarchiveResult)[] = [];
  /**
   * Corrida da confirmação (GRP-24, GRP-32): roda uma vez dentro do `addAttendance`, antes das condições, como se o
   * cancelamento ou o arquivamento tivesse sido gravado entre a leitura do service e a transação da presença.
   */
  const hooks: {
    beforeAddAttendance: ((a: AttendanceRecord, groupId: string) => void)[];
    /** Corrida da reabertura (GRP-44): roda uma vez dentro do `reopen`, antes das condições da transação. */
    beforeReopen: ((gameId: string, groupId: string) => void)[];
    /**
     * Corrida da entrada (GRP-39): roda uma vez dentro do `addMember`/`acceptMemberInvite`, antes das condições,
     * como se outra entrada, a troca do limite ou o arquivamento tivesse sido gravado depois da leitura do service.
     */
    beforeAddMember: ((groupId: string, userId: string) => void)[];
  } = {
    beforeAddAttendance: [],
    beforeReopen: [],
    beforeAddMember: [],
  };
  /** Chamadas ao `addMember` e ao `acceptMemberInvite` do repositório (cópia do grupo recebido). */
  const addCalls: { group: Stored; userId: string; role: MemberRole }[] = [];
  const acceptCalls: { group: Stored; userId: string; now: string }[] = [];
  /** Chamadas ao `reopen` do repositório (GRP-44). */
  const reopenCalls: { gameId: string; groupId: string }[] = [];

  const attKey = (gameId: string, userId: string) => `${gameId}#${userId}`;
  const byKey = (a: string, b: string) => a.localeCompare(b);
  const groupMemberships = (groupId: string) => {
    const found = memberships.get(groupId);
    if (found) return found;
    const created = new Map<string, MembershipRow>();
    memberships.set(groupId, created);
    return created;
  };
  const membershipOf = (groupId: string, userId: string) => {
    const m = memberships.get(groupId)?.get(userId);
    return m && { ...m };
  };
  const roleIn = (groupId: string, userId: string) => memberships.get(groupId)?.get(userId)?.role;
  const insert = (groupId: string, userId: string, role: MemberRole) =>
    groupMemberships(groupId).set(userId, { userId, role, createdAt: now().toISOString() });
  /** Reserva → membro com 1 Update (D5): mantém o `createdAt`, grava `roleChangedAt` e apaga o convite (GRP-41). */
  const promote = (groupId: string, userId: string) => {
    const m = memberships.get(groupId)?.get(userId);
    if (m?.role !== 'reserve') return;
    const { memberInviteExpiresAt: _invite, ...rest } = m;
    groupMemberships(groupId).set(userId, { ...rest, role: 'member', roleChangedAt: now().toISOString() });
  };
  /** Contagem por papel (o item `COUNTERS` do Dynamo, GRP-39), sempre igual às participações gravadas. */
  const countOf = (groupId: string, role: MemberRole) =>
    [...groupMemberships(groupId).values()].filter((m) => m.role === role).length;
  const LIMIT_FIELD = { member: 'maxMembers', reserve: 'maxReserves' } as const;
  const limitOf = (g: Stored, role: MemberRole) => (g as Record<string, unknown>)[LIMIT_FIELD[role]];
  /** Grava um limite direto no item do grupo (o dono trocou o limite entre a leitura e a gravação). */
  const forceLimit = (groupId: string, role: MemberRole, value: number) => {
    const stored = groups.get(groupId);
    if (stored) groups.set(groupId, { ...stored, [LIMIT_FIELD[role]]: value });
  };
  const drop = (groupId: string, userId: string) => memberships.get(groupId)?.delete(userId);
  const swapToken = (groupId: string, kind: InviteKind, newToken: string) => {
    const stored = groups.get(groupId);
    if (stored) groups.set(groupId, { ...stored, [TOKEN_FIELD[kind]]: newToken });
  };
  const tokenIn = (g: Stored, kind: InviteKind) => (g as Record<string, unknown>)[TOKEN_FIELD[kind]];
  const findByToken = (token: string) => {
    const found = [...groups.values()].flatMap((g) => {
      const kind = KINDS.find((k) => tokenIn(g, k) === token);
      return kind ? [{ group: { ...g }, kind }] : [];
    });
    return found[0];
  };
  const dropAttendance = (a: AttendanceRecord) => attendance.delete(attKey(a.gameId, a.userId));
  /** Grava o arquivamento direto no item do grupo (sem os 3 tokens, como a transação do `archive`). */
  const forceArchive = (groupId: string, archivedAt: string) => {
    const stored = groups.get(groupId);
    if (!stored) return;
    const rest = Object.fromEntries(
      Object.entries(stored).filter(([k]) => !Object.values(TOKEN_FIELD).includes(k as never)),
    );
    groups.set(groupId, { ...rest, archivedAt } as unknown as Stored);
  };
  /** Grava o `cancelledAt` direto no item do jogo. */
  const forceCancel = (gameId: string, cancelledAt: string) => {
    const g = games.get(gameId);
    if (g) games.set(gameId, { ...g, cancelledAt });
  };
  /** Tira o `cancelledAt` direto do item do jogo (outra reabertura gravada antes, GRP-44). */
  const forceReopen = (gameId: string) => {
    const g = games.get(gameId);
    if (!g) return;
    const { cancelledAt: _cancelledAt, ...rest } = g;
    games.set(gameId, rest);
  };
  /** O `archive` como o Dynamo faria: já arquivado ou algum token diferente do lido → `stale`. */
  const naturalArchive = (group: Stored, archivedAt: string): ArchiveResult => {
    const stored = groups.get(group.id);
    if (!stored || stored.archivedAt !== undefined) return 'stale';
    if (KINDS.some((k) => tokenIn(stored, k) !== tokenIn(group, k))) return 'stale';
    forceArchive(group.id, archivedAt);
    return 'archived';
  };
  /** O `unarchive` como o Dynamo faria: sem `archivedAt` → `not_archived`. */
  const naturalUnarchive = ({ group, tokens }: UnarchiveArgs): UnarchiveResult => {
    const stored = groups.get(group.id);
    if (!stored || stored.archivedAt === undefined) return 'not_archived';
    const { archivedAt: _archivedAt, ...rest } = stored;
    groups.set(group.id, { ...rest, ...tokens } as Stored);
    return 'unarchived';
  };

  /**
   * O `removeMember` como o Dynamo faria (D6): sumiu → `not_member`; outro papel ou (com `newToken`) token trocado →
   * `stale`. Sem `newToken` é a saída (GRP-42): o link não muda. A participação sai com o convite pendente (GRP-25, 42)
   * e a contagem do papel cai junto (GRP-39).
   */
  const naturalRemove = (args: RemoveArgs): RemoveMemberResult => {
    const current = roleIn(args.group.id, args.userId);
    if (!current) return 'not_member';
    const stored = groups.get(args.group.id);
    if (current !== args.role || !stored) return 'stale';
    if (args.newToken !== undefined && tokenIn(stored, args.role) !== tokenIn(args.group, args.role))
      return 'stale';
    drop(args.group.id, args.userId);
    if (args.newToken !== undefined) swapToken(args.group.id, args.role, args.newToken);
    if (args.attendance) dropAttendance(args.attendance);
    return 'removed';
  };
  /** Condição do limite dentro da gravação (GRP-39): limite trocado ou grupo arquivado depois da leitura → `stale`. */
  const limitChanged = (group: Stored, role: MemberRole) => {
    const stored = groups.get(group.id);
    return !stored || stored.archivedAt !== undefined || limitOf(stored, role) !== limitOf(group, role);
  };
  const isFull = (group: Stored, role: MemberRole) => countOf(group.id, role) >= Number(limitOf(group, role));
  /** O `addMember` como o Dynamo faria (GRP-02, 39). */
  const naturalAdd = (group: Stored, userId: string, role: MemberRole): AddMemberResult => {
    const current = roleIn(group.id, userId);
    // GRP-02: membro aceitando o link de reserva continua membro; entrar de novo não muda nada.
    if (current === 'member' || current === role) return 'unchanged';
    if (limitChanged(group, role)) return 'stale';
    if (isFull(group, role)) return role === 'member' ? 'members_full' : 'reserves_full';
    if (current === 'reserve') {
      promote(group.id, userId);
      return 'promoted';
    }
    insert(group.id, userId, role);
    return 'added';
  };
  /** O aceite do convite como o Dynamo faria (GRP-41): `#role = :reserve AND memberInviteExpiresAt > :now`. */
  const naturalAccept = (group: Stored, userId: string, at: string): AcceptInviteResult => {
    const m = memberships.get(group.id)?.get(userId);
    if (m?.role !== 'reserve' || m.memberInviteExpiresAt === undefined || m.memberInviteExpiresAt <= at)
      return 'invalid';
    if (limitChanged(group, 'member')) return 'stale';
    if (isFull(group, 'member')) return 'members_full';
    promote(group.id, userId);
    return 'promoted';
  };

  /** Nomes da E1; o plano 007 troca por `getByToken`/`rotateToken`. Vão por spread caso a interface ainda os tenha. */
  const legacy = {
    async getByInvite(token: string) {
      const found = findByToken(token);
      return found?.kind === 'member' ? found.group : undefined;
    },
    async rotateInvite(group: Stored, newToken: string) {
      swapToken(group.id, 'member', newToken);
    },
  };

  const groupRepo: GroupRepository = {
    ...legacy,
    async get(id: string, _opts?: ReadOpts) {
      reads.get += 1;
      const g = groups.get(id);
      return g && { ...g };
    },
    getByToken: async (token: string) => findByToken(token),
    async create(group: Stored) {
      groups.set(group.id, { ...group });
      insert(group.id, group.ownerId, 'member');
    },
    async roleOf(groupId: string, userId: string) {
      reads.roleOf += 1;
      return roleIn(groupId, userId);
    },
    async addMember(group: Stored, userId: string, role: MemberRole): Promise<AddMemberResult> {
      addCalls.push({ group: { ...group }, userId, role });
      for (const hook of hooks.beforeAddMember.splice(0)) hook(group.id, userId);
      return naturalAdd(group, userId, role);
    },
    async counts(groupId: string) {
      return { memberCount: countOf(groupId, 'member'), reserveCount: countOf(groupId, 'reserve') };
    },
    async getMembership(groupId: string, userId: string) {
      const m = memberships.get(groupId)?.get(userId);
      if (!m) return undefined;
      return m.memberInviteExpiresAt === undefined
        ? { role: m.role }
        : { role: m.role, memberInviteExpiresAt: m.memberInviteExpiresAt };
    },
    async setMemberInvite(groupId: string, userId: string, expiresAt: string) {
      const m = memberships.get(groupId)?.get(userId);
      if (m?.role !== 'reserve') return 'not_reserve' as const;
      groupMemberships(groupId).set(userId, { ...m, memberInviteExpiresAt: expiresAt });
      return 'set' as const;
    },
    async clearMemberInvite(groupId: string, userId: string) {
      const m = memberships.get(groupId)?.get(userId);
      if (!m) return;
      const { memberInviteExpiresAt: _invite, ...rest } = m;
      groupMemberships(groupId).set(userId, rest);
    },
    async acceptMemberInvite(group: Stored, userId: string, at: string): Promise<AcceptInviteResult> {
      acceptCalls.push({ group: { ...group }, userId, now: at });
      for (const hook of hooks.beforeAddMember.splice(0)) hook(group.id, userId);
      return naturalAccept(group, userId, at);
    },
    listMembers: async (groupId: string) =>
      [...groupMemberships(groupId).values()]
        .sort((x, y) => byKey(x.userId, y.userId))
        .map(({ userId, role, createdAt, memberInviteExpiresAt }) =>
          memberInviteExpiresAt === undefined
            ? { userId, role, createdAt }
            : { userId, role, createdAt, memberInviteExpiresAt },
        ),
    async groupsOf(userId: string) {
      reads.groupsOf += 1;
      return [...memberships.entries()]
        .sort(([x], [y]) => byKey(x, y))
        .flatMap(([groupId, list]) => {
          const m = list.get(userId);
          const g = groups.get(groupId);
          return m && g ? [{ group: { ...g }, role: m.role }] : [];
        });
    },
    async rotateToken(group: Stored, kind: InviteKind, newToken: string) {
      swapToken(group.id, kind, newToken);
    },
    async update(groupId: string, patch: GroupPatch) {
      const stored = groups.get(groupId);
      if (!stored) throw new Error('group not found in memory store');
      const merged = Object.fromEntries(
        Object.entries({ ...stored, ...patch }).filter(([, v]) => v !== null && v !== undefined),
      ) as Stored;
      groups.set(groupId, merged);
      return { ...merged };
    },
    async removeMember(args: RemoveArgs): Promise<RemoveMemberResult> {
      removeCalls.push({ ...args, group: { ...args.group } });
      const scripted = removeScript.shift();
      return scripted ? scripted(args) : naturalRemove(args);
    },
    async archive(group: Stored, archivedAt: string): Promise<ArchiveResult> {
      archiveCalls.push({ group: { ...group }, archivedAt });
      const scripted = archiveScript.shift();
      return scripted ? scripted(group, archivedAt) : naturalArchive(group, archivedAt);
    },
    async unarchive(group: Stored, tokens: UnarchiveArgs['tokens']): Promise<UnarchiveResult> {
      const args = { group: { ...group }, tokens: { ...tokens } };
      unarchiveCalls.push(args);
      const scripted = unarchiveScript.shift();
      return scripted ? scripted(args) : naturalUnarchive(args);
    },
  };

  const gameRepo: GameRepository = {
    async findByDate(groupId: string, date: string, opts?: ReadOpts) {
      findByDateReads.push(opts);
      if (race.stale && !opts?.consistent) {
        race.stale = false;
        return undefined;
      }
      const id = gameByDate.get(`${groupId}#${date}`);
      const g = id === undefined ? undefined : games.get(id);
      return g && { ...g };
    },
    async create(game: GameRecord) {
      const key = `${game.groupId}#${game.date}`;
      if (gameByDate.has(key)) return false;
      gameByDate.set(key, game.id);
      games.set(game.id, { ...game });
      return true;
    },
    async cancel(gameId: string, cancelledAt: string) {
      const g = games.get(gameId);
      if (g) games.set(gameId, { ...g, cancelledAt });
    },
    listAttendance: async (gameId: string, _opts?: ReadOpts) =>
      [...attendance.values()]
        .filter((a) => a.gameId === gameId)
        .sort((x, y) => x.confirmedAt.localeCompare(y.confirmedAt) || x.userId.localeCompare(y.userId))
        .map((a) => ({ ...a })),
    async getAttendance(gameId: string, userId: string) {
      const a = attendance.get(attKey(gameId, userId));
      return a && { ...a };
    },
    /** Como a transação do Dynamo: presença e os `ConditionCheck` do jogo e do grupo (os dois falhando → `archived`). */
    async addAttendance(a: AttendanceRecord, groupId: string) {
      for (const hook of hooks.beforeAddAttendance.splice(0)) hook(a, groupId);
      const key = attKey(a.gameId, a.userId);
      if (attendance.has(key)) return 'exists' as const;
      if (groups.get(groupId)?.archivedAt !== undefined) return 'archived' as const;
      if (games.get(a.gameId)?.cancelledAt !== undefined) return 'cancelled' as const;
      attendance.set(key, { ...a });
      return 'added' as const;
    },
    async removeAttendance(a: AttendanceRecord) {
      dropAttendance(a);
    },
    /** Como a transação do Dynamo (GRP-44): `REMOVE cancelledAt` + `ConditionCheck` do grupo; as duas falhando → `archived`. */
    async reopen(gameId: string, groupId: string) {
      reopenCalls.push({ gameId, groupId });
      for (const hook of hooks.beforeReopen.splice(0)) hook(gameId, groupId);
      if (groups.get(groupId)?.archivedAt !== undefined) return 'archived' as const;
      if (games.get(gameId)?.cancelledAt === undefined) return 'not_cancelled' as const;
      forceReopen(gameId);
      return 'reopened' as const;
    },
  };

  /** Grava um grupo como era antes da E2 (sem reservas, convidados nem os 2 links novos, D3), com o dono membro. */
  const seedLegacy = (raw: Record<string, unknown> & { id: string; ownerId: string }) => {
    groups.set(raw.id, raw as unknown as Stored);
    insert(raw.id, raw.ownerId, 'member');
  };

  return {
    groups: groupRepo,
    games: gameRepo,
    race,
    findByDateReads,
    removeCalls,
    removeScript,
    swapToken,
    seedLegacy,
    reads,
    membershipOf,
    promote,
    drop,
    naturalRemove,
    archiveCalls,
    unarchiveCalls,
    archiveScript,
    unarchiveScript,
    naturalArchive,
    naturalUnarchive,
    forceArchive,
    forceCancel,
    forceReopen,
    hooks,
    reopenCalls,
    addCalls,
    acceptCalls,
    insert,
    forceLimit,
    countOf,
    storedGroup: (id: string) => {
      const g = groups.get(id);
      return g && { ...g };
    },
    gameCount: () => games.size,
  };
}

type Sent = { userId: string } & NewNotification;

function setupServices(now: Date = THURSDAY_10H) {
  const clock = { now };
  const store = memoryStore(() => clock.now);
  const sent: Sent[] = [];
  const byId = new Map(USERS.map((u) => [u.id, u]));
  const deps = {
    groups: store.groups,
    games: store.games,
    users: {
      get: async (id: string) => byId.get(id),
      getMany: async (ids: string[]) => ids.flatMap((id) => byId.get(id) ?? []),
    },
    notifications: {
      async notify(userId: string, input: NewNotification): Promise<Notification> {
        sent.push({ userId, ...input });
        return { id: randomUUID(), createdAt: clock.now.toISOString(), userId, ...input };
      },
    },
    now: () => clock.now,
  };
  const tick = () => {
    clock.now = new Date(clock.now.getTime() + MINUTE);
  };
  return { clock, store, sent, tick, groups: createGroupService(deps), games: createGameService(deps) };
}

function tokenOf(group: Group): string {
  expect(group.inviteToken).toBeTypeOf('string');
  return group.inviteToken ?? '';
}

function reserveTokenOf(group: Group): string {
  expect(group.reserveInviteToken).toBeTypeOf('string');
  return group.reserveInviteToken ?? '';
}

function guestTokenOf(group: Group): string {
  expect(group.guestToken).toBeTypeOf('string');
  return group.guestToken ?? '';
}

type SetupOpts = {
  slots?: number;
  listOpensHoursBefore?: number;
  reservesOpenHoursBefore?: number;
  guestsOpenHoursBefore?: number;
  /** Entram pelo link de membro. */
  members?: string[];
  /** Entram pelo link de reserva (depois dos membros). */
  reserves?: string[];
  now?: Date;
  /** Limites gravados direto no grupo antes das entradas (GRP-38). */
  maxMembers?: number;
  maxReserves?: number;
};

/** Grupo do OWNER (sexta 19h, São Paulo) com os `members` e as `reserves` entrando pelos links. */
async function setup(opts: SetupOpts = {}) {
  const s = setupServices(opts.now);
  const group = await s.groups.create(OWNER, {
    ...INPUT,
    slots: opts.slots ?? INPUT.slots,
    listOpensHoursBefore: opts.listOpensHoursBefore ?? INPUT.listOpensHoursBefore,
    ...(opts.reservesOpenHoursBefore === undefined
      ? {}
      : { reservesOpenHoursBefore: opts.reservesOpenHoursBefore }),
    ...(opts.guestsOpenHoursBefore === undefined
      ? {}
      : { guestsOpenHoursBefore: opts.guestsOpenHoursBefore }),
  });
  if (opts.maxMembers !== undefined) s.store.forceLimit(group.id, 'member', opts.maxMembers);
  if (opts.maxReserves !== undefined) s.store.forceLimit(group.id, 'reserve', opts.maxReserves);
  for (const id of opts.members ?? []) await s.groups.acceptInvite(id, tokenOf(group));
  for (const id of opts.reserves ?? []) await s.groups.acceptInvite(id, reserveTokenOf(group));
  /** Confirma um por vez, avançando o relógio 1 min entre eles (`confirmedAt` define a ordem). */
  const confirmInOrder = async (...ids: string[]) => {
    for (const id of ids) {
      await s.games.confirm(id, group.id, DATE);
      s.tick();
    }
  };
  /** Como `confirmInOrder`, pelo link do jogo (`guestConfirm`). */
  const guestConfirmInOrder = async (...ids: string[]) => {
    for (const id of ids) {
      await s.games.guestConfirm(id, group.guestToken ?? '', DATE);
      s.tick();
    }
  };
  return { ...s, group, confirmInOrder, guestConfirmInOrder };
}

async function expectAppError(p: Promise<unknown>, code: ErrorCode, status: number): Promise<AppError> {
  const err = await p.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  expect(err).toMatchObject({ code, status });
  return err as AppError;
}

const ids = (list: { userId: string }[]) => list.map((x) => x.userId);
const ofType = (sent: Sent[], type: Notification['type']) =>
  sent.filter((n) => n.type === type).map((n) => n.userId);

describe('grupos: criar (caso 1)', () => {
  it('caso 1: cria grupo válido → dono, com inviteToken e createdAt do relógio', async () => {
    const s = setupServices();
    const group = await s.groups.create(OWNER, INPUT);
    expect(GroupSchema.parse(group)).toEqual(group);
    expect(group).toMatchObject({ ...INPUT, ownerId: OWNER });
    expect(tokenOf(group).length).toBeGreaterThan(0);
    expect(group.createdAt).toBe(THURSDAY_10H.toISOString());
  });

  it('caso 1: o dono é membro e o grupo aparece em "meus grupos"', async () => {
    const s = setupServices();
    const group = await s.groups.create(OWNER, INPUT);
    const members = await s.groups.members(OWNER, group.id);
    expect(members).toEqual([{ userId: OWNER, name: 'Dono', isOwner: true, role: 'member' }]);
    const mine = await s.groups.myGroups(OWNER);
    expect(mine.map((g) => g.id)).toEqual([group.id]);
    expect(MyGroupSchema.parse(mine[0])).toBeTruthy();
  });

  it('caso 1: a lista do jogo atual está vazia (o dono não entra sozinho)', async () => {
    const s = setupServices();
    const group = await s.groups.create(OWNER, INPUT);
    const game = await s.games.current(OWNER, group.id);
    expect(GameSchema.parse(game)).toBeTruthy();
    expect(game.confirmed).toEqual([]);
    expect(game.waitlist).toEqual([]);
    expect(game.me).toBeUndefined();
    const [mine] = await s.groups.myGroups(OWNER);
    expect(mine?.game.confirmedCount).toBe(0);
  });

  it('caso 1: sem timeZone → o fuso do perfil do dono', async () => {
    const s = setupServices();
    const group = await s.groups.create(LISBON_OWNER, BASE_INPUT);
    expect(group.timeZone).toBe('Europe/Lisbon');
  });

  it('caso 1: sem timeZone e dono sem fuso no perfil → America/Sao_Paulo', async () => {
    const s = setupServices();
    const group = await s.groups.create(OWNER, BASE_INPUT);
    expect(group.timeZone).toBe('America/Sao_Paulo');
  });

  it('caso 1: timeZone informado vence o do perfil', async () => {
    const s = setupServices();
    const group = await s.groups.create(LISBON_OWNER, { ...BASE_INPUT, timeZone: 'America/Sao_Paulo' });
    expect(group.timeZone).toBe('America/Sao_Paulo');
  });

  it('caso 1 (contrato): vagas 1 → inválido (422 no handler)', () => {
    const result = CreateGroupInputSchema.safeParse({ ...INPUT, slots: 1 });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['slots']);
  });

  it('caso 1 (contrato): antecedência 200 → inválido (422 no handler)', () => {
    const result = CreateGroupInputSchema.safeParse({ ...INPUT, listOpensHoursBefore: 200 });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['listOpensHoursBefore']);
  });
});

describe('grupos: convite (casos 2 e 3)', () => {
  it('caso 2: dono gera link → token novo, e o get do dono mostra o novo', async () => {
    const t = await setup();
    const old = tokenOf(t.group);
    const invite = await t.groups.rotateInvite(OWNER, t.group.id, 'member');
    expect(invite.token).not.toBe(old);
    expect((await t.groups.get(OWNER, t.group.id)).inviteToken).toBe(invite.token);
  });

  it('caso 2: gera outro → o antigo dá GROUP_INVITE_INVALID e o novo funciona', async () => {
    const t = await setup();
    const old = tokenOf(t.group);
    const invite = await t.groups.rotateInvite(OWNER, t.group.id, 'member');
    await expectAppError(t.groups.acceptInvite(A, old), 'GROUP_INVITE_INVALID', 404);
    expect(await t.groups.members(OWNER, t.group.id)).toHaveLength(1);
    const joined = await t.groups.acceptInvite(A, invite.token);
    expect(joined.id).toBe(t.group.id);
  });

  it('caso 2: membro tenta gerar → GROUP_NOT_OWNER; não-membro → GROUP_NOT_FOUND', async () => {
    const t = await setup({ members: [A] });
    await expectAppError(t.groups.rotateInvite(A, t.group.id, 'member'), 'GROUP_NOT_OWNER', 403);
    await expectAppError(t.groups.rotateInvite(OUTSIDER, t.group.id, 'member'), 'GROUP_NOT_FOUND', 404);
    expect((await t.groups.get(OWNER, t.group.id)).inviteToken).toBe(tokenOf(t.group));
  });

  it('caso 3: outro usuário aceita o token → vira membro (sem inviteToken no get dele)', async () => {
    const t = await setup();
    const joined = await t.groups.acceptInvite(A, tokenOf(t.group));
    expect(joined.id).toBe(t.group.id);
    expect(joined.inviteToken).toBeUndefined();
    const seen = await t.groups.get(A, t.group.id);
    expect(seen.id).toBe(t.group.id);
    expect(seen.inviteToken).toBeUndefined();
    expect((await t.groups.myGroups(A)).map((g) => g.id)).toEqual([t.group.id]);
  });

  it('caso 3: aceitar 2ª vez não duplica o membro', async () => {
    const t = await setup();
    await t.groups.acceptInvite(A, tokenOf(t.group));
    const again = await t.groups.acceptInvite(A, tokenOf(t.group));
    expect(again.id).toBe(t.group.id);
    expect(ids(await t.groups.members(OWNER, t.group.id))).toEqual([OWNER, A]);
    expect(await t.groups.myGroups(A)).toHaveLength(1);
  });

  it('caso 3: o dono aceitando o próprio link continua dono e não duplica', async () => {
    const t = await setup();
    await t.groups.acceptInvite(OWNER, tokenOf(t.group));
    expect(await t.groups.members(OWNER, t.group.id)).toEqual([
      { userId: OWNER, name: 'Dono', isOwner: true, role: 'member' },
    ]);
  });

  it('caso 3: token desconhecido → GROUP_INVITE_INVALID', async () => {
    const t = await setup();
    await expectAppError(t.groups.acceptInvite(A, 'nope'), 'GROUP_INVITE_INVALID', 404);
  });

  it('caso 3: não-membro no get → GROUP_NOT_FOUND', async () => {
    const t = await setup();
    await expectAppError(t.groups.get(OUTSIDER, t.group.id), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.groups.members(OUTSIDER, t.group.id), 'GROUP_NOT_FOUND', 404);
  });
});

describe('jogo atual: status no tempo (caso 4, service)', () => {
  it('caso 4: quinta 10h, antecedência 48h → open, jogo de sexta (virtual) com instantes em UTC', async () => {
    const t = await setup({ members: [A] });
    const game = await t.games.current(A, t.group.id);
    expect(GameSchema.parse(game)).toBeTruthy();
    expect(game).toMatchObject({ groupId: t.group.id, date: DATE, status: 'open', slots: 12 });
    expect(iso(game.startsAt)).toBe('2026-11-06T22:00:00.000Z');
    expect(iso(game.opensAt)).toBe('2026-11-04T22:00:00.000Z');
    expect(t.store.gameCount()).toBe(0);
  });

  it('caso 4: antecedência 24h → scheduled e confirmar dá GAME_LIST_NOT_OPEN com { opensAt }', async () => {
    const t = await setup({ listOpensHoursBefore: 24, members: [A] });
    const game = await t.games.current(A, t.group.id);
    expect(game.status).toBe('scheduled');
    expect(iso(game.opensAt)).toBe('2026-11-05T22:00:00.000Z');
    const err = await expectAppError(t.games.confirm(A, t.group.id, DATE), 'GAME_LIST_NOT_OPEN', 409);
    expect(iso((err.details as { opensAt: string }).opensAt)).toBe('2026-11-05T22:00:00.000Z');
    expect((await t.games.current(A, t.group.id)).confirmed).toEqual([]);
  });

  it('caso 4: antecedência 24h → desistir também dá GAME_LIST_NOT_OPEN', async () => {
    const t = await setup({ listOpensHoursBefore: 24, members: [A] });
    await expectAppError(t.games.leave(A, t.group.id, DATE), 'GAME_LIST_NOT_OPEN', 409);
  });

  it('caso 4: sexta 20h → in_progress, lista visível', async () => {
    const t = await setup({ members: [A, B] });
    await t.confirmInOrder(A, B);
    t.clock.now = FRIDAY_20H;
    const game = await t.games.current(A, t.group.id);
    expect(game.status).toBe('in_progress');
    expect(game.date).toBe(DATE);
    expect(ids(game.confirmed)).toEqual([A, B]);
  });

  it('caso 4: sexta 20h → confirmar, desistir e cancelar dão GAME_CLOSED', async () => {
    const t = await setup({ members: [A, B, C] });
    await t.confirmInOrder(A, B);
    t.clock.now = FRIDAY_20H;
    await expectAppError(t.games.confirm(C, t.group.id, DATE), 'GAME_CLOSED', 409);
    await expectAppError(t.games.leave(A, t.group.id, DATE), 'GAME_CLOSED', 409);
    await expectAppError(t.games.cancel(OWNER, t.group.id, DATE), 'GAME_CLOSED', 409);
    const game = await t.games.current(A, t.group.id);
    expect(game.status).toBe('in_progress');
    expect(ids(game.confirmed)).toEqual([A, B]);
    expect(t.sent).toEqual([]);
  });

  it('caso 4: sexta 22h01 → o atual é o da sexta seguinte, com a lista vazia', async () => {
    const t = await setup({ members: [A] });
    await t.confirmInOrder(A);
    t.clock.now = FRIDAY_22H01;
    const game = await t.games.current(A, t.group.id);
    expect(game.date).toBe(NEXT_DATE);
    expect(game.status).toBe('scheduled');
    expect(iso(game.startsAt)).toBe('2026-11-13T22:00:00.000Z');
    expect(game.confirmed).toEqual([]);
    expect(game.me).toBeUndefined();
  });

  it('caso 4: data diferente do jogo atual (ou inválida) → GAME_NOT_FOUND', async () => {
    const t = await setup({ members: [A] });
    await expectAppError(t.games.confirm(A, t.group.id, NEXT_DATE), 'GAME_NOT_FOUND', 404);
    await expectAppError(t.games.confirm(A, t.group.id, 'not-a-date'), 'GAME_NOT_FOUND', 404);
    await expectAppError(t.games.leave(A, t.group.id, '2026-10-30'), 'GAME_NOT_FOUND', 404);
    await expectAppError(t.games.cancel(OWNER, t.group.id, NEXT_DATE), 'GAME_NOT_FOUND', 404);
  });
});

describe('jogo atual: corrida na criação do jogo (tarefa 6a, D2)', () => {
  it('6a: confirmar no jogo virtual e perder a corrida → relê consistente e usa o jogo vencedor', async () => {
    const t = await setup({ members: [A] });
    const winner: GameRecord = {
      id: randomUUID(),
      createdAt: THURSDAY_10H.toISOString(),
      groupId: t.group.id,
      date: DATE,
    };
    expect(await t.store.games.create(winner)).toBe(true);
    t.store.race.stale = true;

    const game = await t.games.confirm(A, t.group.id, DATE);

    expect(t.store.gameCount()).toBe(1);
    expect(t.store.findByDateReads).toContainEqual({ consistent: true });
    expect(ids(await t.store.games.listAttendance(winner.id))).toEqual([A]);
    expect(ids(game.confirmed)).toEqual([A]);
  });

  it('6a: cancelar no jogo virtual e perder a corrida → cancela o jogo vencedor', async () => {
    const t = await setup();
    const winner: GameRecord = {
      id: randomUUID(),
      createdAt: THURSDAY_10H.toISOString(),
      groupId: t.group.id,
      date: DATE,
    };
    expect(await t.store.games.create(winner)).toBe(true);
    t.store.race.stale = true;

    const game = await t.games.cancel(OWNER, t.group.id, DATE);

    expect(game.status).toBe('cancelled');
    expect(t.store.gameCount()).toBe(1);
    expect(t.store.findByDateReads).toContainEqual({ consistent: true });
    expect(
      (await t.store.games.findByDate(t.group.id, DATE, { consistent: true }))?.cancelledAt,
    ).toBeDefined();
  });

  it('6a: a primeira escrita materializa o jogo uma vez só', async () => {
    const t = await setup({ members: [A, B] });
    await t.confirmInOrder(A, B);
    expect(t.store.gameCount()).toBe(1);
  });
});

describe('presença (caso 5)', () => {
  it('caso 5: membro confirma → entra na ordem, com confirmedAt do relógio', async () => {
    const t = await setup({ members: [A] });
    const game = await t.games.confirm(A, t.group.id, DATE);
    expect(GameSchema.parse(game)).toBeTruthy();
    expect(ids(game.confirmed)).toEqual([A]);
    expect(iso(game.confirmed[0]?.confirmedAt ?? '')).toBe(THURSDAY_10H.toISOString());
    expect(game.me).toEqual({ list: 'confirmed', position: 1 });
  });

  it('caso 5: confirma de novo → mesma posição e mesmo confirmedAt', async () => {
    const t = await setup({ members: [A, B] });
    await t.confirmInOrder(A, B);
    const again = await t.games.confirm(A, t.group.id, DATE);
    expect(ids(again.confirmed)).toEqual([A, B]);
    expect(iso(again.confirmed[0]?.confirmedAt ?? '')).toBe(THURSDAY_10H.toISOString());
    expect(again.me).toEqual({ list: 'confirmed', position: 1 });
  });

  it('caso 5: desiste → sai da lista; desistir sem presença é ok', async () => {
    const t = await setup({ members: [A, B] });
    await t.confirmInOrder(A, B);
    await t.games.leave(A, t.group.id, DATE);
    const game = await t.games.current(A, t.group.id);
    expect(ids(game.confirmed)).toEqual([B]);
    expect(game.me).toBeUndefined();
    await expect(t.games.leave(A, t.group.id, DATE)).resolves.toBeUndefined();
    await expect(t.games.leave(OWNER, t.group.id, DATE)).resolves.toBeUndefined();
  });

  it('caso 5: reconfirmar depois de desistir vai para o fim (D5)', async () => {
    const t = await setup({ members: [A, B] });
    await t.confirmInOrder(A, B);
    await t.games.leave(A, t.group.id, DATE);
    t.tick();
    const game = await t.games.confirm(A, t.group.id, DATE);
    expect(ids(game.confirmed)).toEqual([B, A]);
    expect(game.me).toEqual({ list: 'confirmed', position: 2 });
  });

  it('caso 5: não-membro → GROUP_NOT_FOUND em confirmar, desistir e ver o jogo', async () => {
    const t = await setup();
    await expectAppError(t.games.confirm(OUTSIDER, t.group.id, DATE), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.games.leave(OUTSIDER, t.group.id, DATE), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.games.current(OUTSIDER, t.group.id), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.games.current(A, randomUUID()), 'GROUP_NOT_FOUND', 404);
    expect(t.store.gameCount()).toBe(0);
  });

  it('caso 5: não-membro com data errada → GROUP_NOT_FOUND vem antes de GAME_NOT_FOUND', async () => {
    const t = await setup();
    await expectAppError(t.games.confirm(OUTSIDER, t.group.id, NEXT_DATE), 'GROUP_NOT_FOUND', 404);
  });

  it('caso 5: o dono só entra na lista se confirmar', async () => {
    const t = await setup({ members: [A] });
    await t.confirmInOrder(A, OWNER);
    const game = await t.games.current(OWNER, t.group.id);
    expect(ids(game.confirmed)).toEqual([A, OWNER]);
    expect(game.me).toEqual({ list: 'confirmed', position: 2 });
  });
});

describe('fila (caso 6)', () => {
  it('caso 6: vagas 2, três confirmam → 3º na fila', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    const game = await t.games.current(C, t.group.id);
    expect(ids(game.confirmed)).toEqual([A, B]);
    expect(ids(game.waitlist)).toEqual([C]);
    expect(game.me).toEqual({ list: 'waitlist', position: 1 });
    expect(t.sent).toEqual([]);
  });

  it('caso 6: 1º desiste → 3º fica dentro e recebe waitlist_promoted', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    await t.games.leave(A, t.group.id, DATE);
    const game = await t.games.current(C, t.group.id);
    expect(ids(game.confirmed)).toEqual([B, C]);
    expect(game.waitlist).toEqual([]);
    expect(game.me).toEqual({ list: 'confirmed', position: 2 });
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]).toMatchObject({ userId: C, type: 'waitlist_promoted', link: `/groups/${t.group.id}` });
  });

  it('caso 6: quem estava na fila desiste → ninguém é notificado', async () => {
    const t = await setup({ slots: 2, members: [A, B, C, D] });
    await t.confirmInOrder(A, B, C, D);
    await t.games.leave(C, t.group.id, DATE);
    const game = await t.games.current(D, t.group.id);
    expect(ids(game.confirmed)).toEqual([A, B]);
    expect(ids(game.waitlist)).toEqual([D]);
    expect(game.me).toEqual({ list: 'waitlist', position: 1 });
    expect(t.sent).toEqual([]);
  });

  it('caso 6: desistência de quem está dentro sem ninguém na fila → ninguém é notificado', async () => {
    const t = await setup({ slots: 2, members: [A, B] });
    await t.confirmInOrder(A, B);
    await t.games.leave(A, t.group.id, DATE);
    expect(t.sent).toEqual([]);
  });
});

describe('cancelamento (caso 7)', () => {
  it('caso 7: dono cancela → cancelled; confirmados e fila recebem game_cancelled, o dono não', async () => {
    const t = await setup({ slots: 2, members: [A, B] });
    await t.confirmInOrder(OWNER, A, B);
    const game = await t.games.cancel(OWNER, t.group.id, DATE);
    expect(GameSchema.parse(game)).toBeTruthy();
    expect(game.status).toBe('cancelled');
    expect(ofType(t.sent, 'game_cancelled').sort()).toEqual([A, B].sort());
    expect(t.sent.every((n) => n.link === `/groups/${t.group.id}`)).toBe(true);
    expect((await t.games.current(A, t.group.id)).status).toBe('cancelled');
  });

  it('caso 7: confirmar ou desistir depois → GAME_CANCELLED', async () => {
    const t = await setup({ members: [A, B] });
    await t.confirmInOrder(A);
    await t.games.cancel(OWNER, t.group.id, DATE);
    await expectAppError(t.games.confirm(B, t.group.id, DATE), 'GAME_CANCELLED', 409);
    await expectAppError(t.games.leave(A, t.group.id, DATE), 'GAME_CANCELLED', 409);
  });

  it('caso 7: cancelado continua cancelled durante a janela do jogo (GAME_CANCELLED antes de GAME_CLOSED)', async () => {
    const t = await setup({ members: [A] });
    await t.games.cancel(OWNER, t.group.id, DATE);
    t.clock.now = FRIDAY_20H;
    expect((await t.games.current(A, t.group.id)).status).toBe('cancelled');
    await expectAppError(t.games.confirm(A, t.group.id, DATE), 'GAME_CANCELLED', 409);
  });

  it('caso 7: cancelar de novo devolve igual e não notifica outra vez', async () => {
    const t = await setup({ members: [A] });
    await t.confirmInOrder(A);
    const first = await t.games.cancel(OWNER, t.group.id, DATE);
    t.tick();
    const second = await t.games.cancel(OWNER, t.group.id, DATE);
    expect(second).toEqual(first);
    expect(ofType(t.sent, 'game_cancelled')).toEqual([A]);
  });

  it('caso 7: cancelar o jogo virtual (sem ninguém) funciona e não notifica', async () => {
    const t = await setup({ members: [A] });
    const game = await t.games.cancel(OWNER, t.group.id, DATE);
    expect(game.status).toBe('cancelled');
    expect(t.sent).toEqual([]);
    expect((await t.games.current(A, t.group.id)).status).toBe('cancelled');
  });

  it('caso 7: membro cancela → GROUP_NOT_OWNER; não-membro → GROUP_NOT_FOUND', async () => {
    const t = await setup({ members: [A] });
    await t.confirmInOrder(A);
    await expectAppError(t.games.cancel(A, t.group.id, DATE), 'GROUP_NOT_OWNER', 403);
    await expectAppError(t.games.cancel(OUTSIDER, t.group.id, DATE), 'GROUP_NOT_FOUND', 404);
    expect((await t.games.current(A, t.group.id)).status).toBe('open');
    expect(t.sent).toEqual([]);
  });
});

describe('listas e meus grupos (caso 8)', () => {
  it('caso 8: membro vê confirmed e waitlist com nomes', async () => {
    const t = await setup({ slots: 2, members: [A, C, D] });
    await t.confirmInOrder(A, C, D);
    const game = await t.games.current(A, t.group.id);
    expect(game.confirmed.map((x) => [x.userId, x.name])).toEqual([
      [A, 'Ana'],
      [C, 'Caio'],
    ]);
    expect(game.waitlist.map((x) => [x.userId, x.name])).toEqual([[D, 'Duda']]);
    expect(iso(game.waitlist[0]?.confirmedAt ?? '')).toBe(
      new Date(THURSDAY_10H.getTime() + 2 * MINUTE).toISOString(),
    );
  });

  it('caso 8: lista de membros com o dono primeiro e name = nickname ?? name', async () => {
    const t = await setup({ members: [B, A] });
    const members = await t.groups.members(A, t.group.id);
    expect(members[0]).toEqual({ userId: OWNER, name: 'Dono', isOwner: true, role: 'member' });
    expect(members.slice(1).sort((x, y) => x.userId.localeCompare(y.userId))).toEqual([
      { userId: A, name: 'Ana', isOwner: false, role: 'member' },
      { userId: B, name: 'Bia', isOwner: false, role: 'member' },
    ]);
  });

  it('caso 8: "meus grupos" traz o jogo atual de cada grupo (confirmedCount = min(lista, vagas) e me)', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    const other = await t.groups.create(OWNER, {
      ...INPUT,
      name: 'Futebol de terça',
      sport: 'soccer',
      weekday: 2,
    });
    await t.groups.acceptInvite(C, tokenOf(other));

    const mine = await t.groups.myGroups(C);
    expect(mine.map((g) => g.id).sort()).toEqual([t.group.id, other.id].sort());
    for (const g of mine) expect(MyGroupSchema.parse(g)).toBeTruthy();

    const volley = mine.find((g) => g.id === t.group.id);
    expect(volley?.game).toMatchObject({ date: DATE, status: 'open', slots: 2, confirmedCount: 2 });
    expect(volley?.game.me).toEqual({ list: 'waitlist', position: 1 });
    expect(iso(volley?.game.startsAt ?? '')).toBe('2026-11-06T22:00:00.000Z');
    expect(volley?.inviteToken).toBeUndefined();

    const soccer = mine.find((g) => g.id === other.id);
    expect(soccer?.game).toMatchObject({ date: '2026-11-10', confirmedCount: 0 });
    expect(soccer?.game.me).toBeUndefined();

    const [mineA] = await t.groups.myGroups(A);
    expect(mineA?.game.me).toEqual({ list: 'confirmed', position: 1 });
  });

  it('caso 8: quem não está em nenhum grupo → "meus grupos" vazio', async () => {
    const t = await setup();
    expect(await t.groups.myGroups(OUTSIDER)).toEqual([]);
  });
});

describe('remover membro (casos 10–13)', () => {
  it('caso 10: dono remove A (dentro) → A perde o grupo e sai da lista', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    await expect(t.groups.removeMember(OWNER, t.group.id, A)).resolves.toBeUndefined();
    await expectAppError(t.groups.get(A, t.group.id), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.games.current(A, t.group.id), 'GROUP_NOT_FOUND', 404);
    expect(await t.groups.myGroups(A)).toEqual([]);
    expect(ids(await t.groups.members(OWNER, t.group.id))).not.toContain(A);
  });

  it('caso 10: C sobe e recebe waitlist_promoted; A não é notificado', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    await t.groups.removeMember(OWNER, t.group.id, A);
    const game = await t.games.current(OWNER, t.group.id);
    expect(ids(game.confirmed)).toEqual([B, C]);
    expect(game.waitlist).toEqual([]);
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]).toMatchObject({ userId: C, type: 'waitlist_promoted', link: `/groups/${t.group.id}` });
  });

  it('caso 10: remover quem estava na fila → sai da lista e ninguém é notificado', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    await t.groups.removeMember(OWNER, t.group.id, C);
    const game = await t.games.current(OWNER, t.group.id);
    expect(ids(game.confirmed)).toEqual([A, B]);
    expect(game.waitlist).toEqual([]);
    expect(t.sent).toEqual([]);
  });

  it('caso 10: remover membro sem presença (jogo virtual) funciona', async () => {
    const t = await setup({ members: [A] });
    await t.groups.removeMember(OWNER, t.group.id, A);
    await expectAppError(t.groups.get(A, t.group.id), 'GROUP_NOT_FOUND', 404);
    expect(t.sent).toEqual([]);
  });

  it('caso 11: dono tenta se remover → GROUP_OWNER_NOT_REMOVABLE', async () => {
    const t = await setup({ members: [A] });
    await expectAppError(t.groups.removeMember(OWNER, t.group.id, OWNER), 'GROUP_OWNER_NOT_REMOVABLE', 409);
    expect(ids(await t.groups.members(OWNER, t.group.id))).toContain(OWNER);
  });

  it('caso 11: membro tenta remover outro → GROUP_NOT_OWNER', async () => {
    const t = await setup({ members: [A, B] });
    await expectAppError(t.groups.removeMember(A, t.group.id, B), 'GROUP_NOT_OWNER', 403);
    expect(ids(await t.groups.members(OWNER, t.group.id))).toContain(B);
  });

  it('caso 11: remover quem não é membro → GROUP_MEMBER_NOT_FOUND', async () => {
    const t = await setup({ members: [A] });
    await expectAppError(t.groups.removeMember(OWNER, t.group.id, OUTSIDER), 'GROUP_MEMBER_NOT_FOUND', 404);
    expect((await t.groups.get(OWNER, t.group.id)).inviteToken).toBe(tokenOf(t.group));
  });

  it('caso 11: ordem dos erros → não-membro dá GROUP_NOT_FOUND; membro removendo o dono dá GROUP_NOT_OWNER', async () => {
    const t = await setup({ members: [A] });
    await expectAppError(t.groups.removeMember(OUTSIDER, t.group.id, A), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.groups.removeMember(A, t.group.id, OWNER), 'GROUP_NOT_OWNER', 403);
    await expectAppError(t.groups.removeMember(A, t.group.id, OUTSIDER), 'GROUP_NOT_OWNER', 403);
  });

  it('caso 12: depois de uma remoção, o token antigo dá GROUP_INVITE_INVALID e o grupo tem um token novo', async () => {
    const t = await setup({ members: [A] });
    const old = tokenOf(t.group);
    await t.groups.removeMember(OWNER, t.group.id, A);
    await expectAppError(t.groups.acceptInvite(A, old), 'GROUP_INVITE_INVALID', 404);
    await expectAppError(t.groups.acceptInvite(OUTSIDER, old), 'GROUP_INVITE_INVALID', 404);
    const fresh = tokenOf(await t.groups.get(OWNER, t.group.id));
    expect(fresh).not.toBe(old);
    const joined = await t.groups.acceptInvite(OUTSIDER, fresh);
    expect(joined.id).toBe(t.group.id);
  });

  it('caso 13: jogo in_progress, dono remove um confirmado → perde o acesso, continua na lista, ninguém notificado', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    t.clock.now = FRIDAY_20H;
    await t.groups.removeMember(OWNER, t.group.id, A);
    await expectAppError(t.groups.get(A, t.group.id), 'GROUP_NOT_FOUND', 404);
    expect(await t.groups.myGroups(A)).toEqual([]);
    const game = await t.games.current(OWNER, t.group.id);
    expect(game.status).toBe('in_progress');
    expect(ids(game.confirmed)).toEqual([A, B]);
    expect(ids(game.waitlist)).toEqual([C]);
    expect(t.sent).toEqual([]);
  });
});

describe('remover membro: corrida com outra escrita (plano 006, casos 11–13)', () => {
  it('caso 11: B já foi removido por outra requisição (not_member) → GROUP_MEMBER_NOT_FOUND e ninguém notificado', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    t.store.removeScript.push(() => 'not_member');
    await expectAppError(t.groups.removeMember(OWNER, t.group.id, B), 'GROUP_MEMBER_NOT_FOUND', 404);
    expect(t.store.removeCalls).toHaveLength(1);
    expect(t.sent).toEqual([]);
  });

  it('caso 12: convite trocado no meio (stale e depois removed) → remove com o grupo relido e promove uma vez', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    const rotated = 'rotated-by-another-request';
    t.store.removeScript.push((args) => {
      t.store.swapToken(args.group.id, 'member', rotated);
      return 'stale';
    });

    await expect(t.groups.removeMember(OWNER, t.group.id, B)).resolves.toBeUndefined();

    expect(t.store.removeCalls).toHaveLength(2);
    expect(t.store.removeCalls[0]?.group.inviteToken).toBe(tokenOf(t.group));
    expect(t.store.removeCalls[1]?.group.inviteToken).toBe(rotated);
    expect(t.store.removeCalls[1]?.userId).toBe(B);
    expect(ids(await t.groups.members(OWNER, t.group.id))).not.toContain(B);
    const game = await t.games.current(OWNER, t.group.id);
    expect(ids(game.confirmed)).toEqual([A, C]);
    expect(game.waitlist).toEqual([]);
    expect(ofType(t.sent, 'waitlist_promoted')).toEqual([C]);
    expect(t.sent).toHaveLength(1);
  });

  it('caso 13: stale 3 vezes → erro comum (500), não appError, e nada muda', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    t.store.removeScript.push(
      () => 'stale',
      () => 'stale',
      () => 'stale',
    );

    const err = await t.groups.removeMember(OWNER, t.group.id, B).then(
      () => undefined,
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(AppError);
    expect(t.store.removeCalls).toHaveLength(3);
    expect(ids(await t.groups.members(OWNER, t.group.id))).toContain(B);
    expect(t.sent).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Plano 007 (E2): reservas, link do jogo e lista em camadas. Relógio: quinta 10h, jogo sexta 19h.
// ---------------------------------------------------------------------------------------------

const opensAtOf = (err: AppError) => iso((err.details as { opensAt: string }).opensAt);
const fieldOf = (err: AppError) => (err.details as { field: string }).field;
const noTokens = (g: Group) => {
  expect(g.inviteToken).toBeUndefined();
  expect(g.reserveInviteToken).toBeUndefined();
  expect(g.guestToken).toBeUndefined();
};

describe('E2: criar com camadas (casos 1 e 2)', () => {
  it('caso 1: sem os campos novos, membros 48 → reservas 24, convidados desligados e os 3 links gerados', async () => {
    const s = setupServices();
    const group = await s.groups.create(OWNER, INPUT);
    expect(GroupSchema.parse(group)).toEqual(group);
    expect(group.reservesOpenHoursBefore).toBe(24);
    expect(group.guestsOpenHoursBefore).toBeUndefined();
    expect(group.myRole).toBe('member');
    const tokens = [tokenOf(group), reserveTokenOf(group), guestTokenOf(group)];
    expect(tokens.every((tk) => tk.length > 0)).toBe(true);
    expect(new Set(tokens).size).toBe(3);
  });

  it('caso 1: reservas padrão = metade dos membros arredondada para baixo (25 → 12)', async () => {
    const s = setupServices();
    const group = await s.groups.create(OWNER, { ...INPUT, listOpensHoursBefore: 25 });
    expect(group.reservesOpenHoursBefore).toBe(12);
  });

  it('caso 1: reservas e convidados informados são gravados', async () => {
    const s = setupServices();
    const group = await s.groups.create(OWNER, {
      ...INPUT,
      reservesOpenHoursBefore: 10,
      guestsOpenHoursBefore: 2,
    });
    expect(group).toMatchObject({
      listOpensHoursBefore: 48,
      reservesOpenHoursBefore: 10,
      guestsOpenHoursBefore: 2,
    });
  });

  it('caso 1: o dono vê os 3 links; membro e reserva não veem nenhum', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    const own = await t.groups.get(OWNER, t.group.id);
    expect(own.inviteToken).toBe(tokenOf(t.group));
    expect(own.reserveInviteToken).toBe(reserveTokenOf(t.group));
    expect(own.guestToken).toBe(guestTokenOf(t.group));
    for (const id of [A, R]) {
      noTokens(await t.groups.get(id, t.group.id));
      const [mine] = await t.groups.myGroups(id);
      expect(mine).toBeDefined();
      if (mine) noTokens(mine);
    }
  });

  it('caso 2 (contrato): reservas 50 com membros 48 → issue em reservesOpenHoursBefore', () => {
    const result = CreateGroupInputSchema.safeParse({ ...INPUT, reservesOpenHoursBefore: 50 });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path)).toEqual([['reservesOpenHoursBefore']]);
  });

  it('caso 2 (contrato): convidados 30 com reservas 24 (informadas ou pela metade) → issue em guestsOpenHoursBefore', () => {
    const explicit = CreateGroupInputSchema.safeParse({
      ...INPUT,
      reservesOpenHoursBefore: 24,
      guestsOpenHoursBefore: 30,
    });
    expect(explicit.error?.issues.map((i) => i.path)).toEqual([['guestsOpenHoursBefore']]);
    const halved = CreateGroupInputSchema.safeParse({ ...INPUT, guestsOpenHoursBefore: 30 });
    expect(halved.error?.issues.map((i) => i.path)).toEqual([['guestsOpenHoursBefore']]);
    expect(CreateGroupInputSchema.safeParse({ ...INPUT, guestsOpenHoursBefore: 24 }).success).toBe(true);
  });

  it('caso 2: o service recusa reservas acima dos membros → GROUP_LAYERS_INVALID (reservesOpenHoursBefore) e não cria', async () => {
    const s = setupServices();
    const err = await expectAppError(
      s.groups.create(OWNER, { ...INPUT, reservesOpenHoursBefore: 50 }),
      'GROUP_LAYERS_INVALID',
      422,
    );
    expect(fieldOf(err)).toBe('reservesOpenHoursBefore');
    expect(await s.groups.myGroups(OWNER)).toEqual([]);
  });

  it('caso 2: o service recusa convidados acima das reservas → GROUP_LAYERS_INVALID (guestsOpenHoursBefore)', async () => {
    const s = setupServices();
    const explicit = await expectAppError(
      s.groups.create(OWNER, { ...INPUT, reservesOpenHoursBefore: 24, guestsOpenHoursBefore: 30 }),
      'GROUP_LAYERS_INVALID',
      422,
    );
    expect(fieldOf(explicit)).toBe('guestsOpenHoursBefore');
    const halved = await expectAppError(
      s.groups.create(OWNER, { ...INPUT, guestsOpenHoursBefore: 30 }),
      'GROUP_LAYERS_INVALID',
      422,
    );
    expect(fieldOf(halved)).toBe('guestsOpenHoursBefore');
    expect(await s.groups.myGroups(OWNER)).toEqual([]);
  });
});

describe('E2: link de reserva (casos 3 e 4)', () => {
  it('caso 3: aceitar o link de reserva → myRole reserve, em "meus grupos" e em members com role reserve', async () => {
    const t = await setup();
    const joined = await t.groups.acceptInvite(R, reserveTokenOf(t.group));
    expect(GroupSchema.parse(joined)).toBeTruthy();
    expect(joined).toMatchObject({ id: t.group.id, myRole: 'reserve' });
    noTokens(joined);
    expect((await t.groups.get(R, t.group.id)).myRole).toBe('reserve');
    const mine = await t.groups.myGroups(R);
    expect(mine.map((g) => [g.id, g.myRole])).toEqual([[t.group.id, 'reserve']]);
    expect(await t.groups.members(OWNER, t.group.id)).toEqual([
      { userId: OWNER, name: 'Dono', isOwner: true, role: 'member' },
      { userId: R, name: 'Rafa', isOwner: false, role: 'reserve' },
    ]);
  });

  it('caso 3: aceitar o link de reserva de novo → nada duplica', async () => {
    const t = await setup({ reserves: [R] });
    const again = await t.groups.acceptInvite(R, reserveTokenOf(t.group));
    expect(again.myRole).toBe('reserve');
    expect(ids(await t.groups.members(OWNER, t.group.id))).toEqual([OWNER, R]);
    expect(await t.groups.myGroups(R)).toHaveLength(1);
  });

  it('caso 3: members traz os membros primeiro (dono no topo) e depois as reservas', async () => {
    const t = await setup();
    await t.groups.acceptInvite(R, reserveTokenOf(t.group));
    await t.groups.acceptInvite(A, tokenOf(t.group));
    await t.groups.acceptInvite(B, tokenOf(t.group));
    const list = await t.groups.members(R, t.group.id);
    expect(list.map((m) => m.role)).toEqual(['member', 'member', 'member', 'reserve']);
    expect(list[0]?.userId).toBe(OWNER);
    expect(list[3]?.userId).toBe(R);
  });

  it('caso 4: reserva aceita o link de membro → vira membro (sai das reservas)', async () => {
    const t = await setup({ reserves: [R] });
    const joined = await t.groups.acceptInvite(R, tokenOf(t.group));
    expect(joined.myRole).toBe('member');
    expect(await t.store.groups.roleOf(t.group.id, R)).toBe('member');
    const list = await t.groups.members(OWNER, t.group.id);
    expect(list.filter((m) => m.userId === R)).toEqual([
      { userId: R, name: 'Rafa', isOwner: false, role: 'member' },
    ]);
    expect(list.some((m) => m.role === 'reserve')).toBe(false);
  });

  it('caso 4: membro aceita o link de reserva → continua membro (o dono também)', async () => {
    const t = await setup({ members: [A] });
    expect((await t.groups.acceptInvite(A, reserveTokenOf(t.group))).myRole).toBe('member');
    expect((await t.groups.acceptInvite(OWNER, reserveTokenOf(t.group))).myRole).toBe('member');
    expect(await t.groups.members(OWNER, t.group.id)).toEqual([
      { userId: OWNER, name: 'Dono', isOwner: true, role: 'member' },
      { userId: A, name: 'Ana', isOwner: false, role: 'member' },
    ]);
  });
});

describe('E2: presença por camada (casos 5–7)', () => {
  it('caso 5: às 10h de quinta o membro confirma e a reserva recebe GAME_LIST_NOT_OPEN com opensAt = quinta 19h', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    const game = await t.games.confirm(A, t.group.id, DATE);
    expect(ids(game.confirmed)).toEqual([A]);
    const err = await expectAppError(t.games.confirm(R, t.group.id, DATE), 'GAME_LIST_NOT_OPEN', 409);
    expect(opensAtOf(err)).toBe(THURSDAY_19H.toISOString());
    expect(ids((await t.games.current(OWNER, t.group.id)).confirmed)).toEqual([A]);
  });

  it('caso 5: às 19h de quinta a reserva confirma e entra com role reserve', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    await t.confirmInOrder(A);
    t.clock.now = THURSDAY_19H;
    const game = await t.games.confirm(R, t.group.id, DATE);
    expect(GameSchema.parse(game)).toBeTruthy();
    expect(game.confirmed.map((x) => [x.userId, x.role])).toEqual([
      [A, 'member'],
      [R, 'reserve'],
    ]);
    expect(game.me).toEqual({ list: 'confirmed', position: 2 });
  });

  it('caso 6: myOpensAt da reserva = abertura das reservas; do membro = opensAt; reservesOpensAt igual para todos', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    const forMember = await t.games.current(A, t.group.id);
    const forReserve = await t.games.current(R, t.group.id);
    expect(GameSchema.parse(forMember)).toBeTruthy();
    expect(GameSchema.parse(forReserve)).toBeTruthy();
    expect(iso(forMember.opensAt)).toBe(WEDNESDAY_19H.toISOString());
    expect(iso(forMember.myOpensAt ?? '')).toBe(iso(forMember.opensAt));
    expect(iso(forReserve.myOpensAt ?? '')).toBe(THURSDAY_19H.toISOString());
    expect(iso(forMember.reservesOpensAt)).toBe(THURSDAY_19H.toISOString());
    expect(iso(forReserve.reservesOpensAt)).toBe(THURSDAY_19H.toISOString());
    expect(forMember.guestsOpensAt).toBeUndefined();
    expect(forReserve.guestsOpensAt).toBeUndefined();
  });

  it('caso 6: o status segue a camada dos membros, também para a reserva', async () => {
    const t = await setup({ reserves: [R] });
    expect((await t.games.current(R, t.group.id)).status).toBe('open');
  });

  it('caso 6: com convidados 6 h, guestsOpensAt = sexta 13h para membro e reserva', async () => {
    const t = await setup({ members: [A], reserves: [R], guestsOpenHoursBefore: 6 });
    for (const id of [A, R]) {
      expect(iso((await t.games.current(id, t.group.id)).guestsOpensAt ?? '')).toBe(FRIDAY_13H.toISOString());
    }
  });

  it('caso 7: vagas 2, A e R dentro; B confirma → fila (D1); R desiste → B sobe e recebe waitlist_promoted', async () => {
    const t = await setup({ slots: 2, reservesOpenHoursBefore: 48, members: [A, B], reserves: [R] });
    await t.confirmInOrder(A, R, B);
    const full = await t.games.current(B, t.group.id);
    expect(full.confirmed.map((x) => [x.userId, x.role])).toEqual([
      [A, 'member'],
      [R, 'reserve'],
    ]);
    expect(ids(full.waitlist)).toEqual([B]);
    expect(full.me).toEqual({ list: 'waitlist', position: 1 });
    expect(t.sent).toEqual([]);

    await t.games.leave(R, t.group.id, DATE);
    const game = await t.games.current(B, t.group.id);
    expect(ids(game.confirmed)).toEqual([A, B]);
    expect(game.waitlist).toEqual([]);
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]).toMatchObject({ userId: B, type: 'waitlist_promoted', link: `/groups/${t.group.id}` });
  });
});

describe('E2: link do jogo (casos 8–10)', () => {
  it('caso 8: convidados desligados → ver, confirmar e desistir pelo link dão GAME_LINK_INVALID', async () => {
    const t = await setup();
    const token = guestTokenOf(t.group);
    await expectAppError(t.games.guestView(G, token), 'GAME_LINK_INVALID', 404);
    await expectAppError(t.games.guestConfirm(G, token, DATE), 'GAME_LINK_INVALID', 404);
    await expectAppError(t.games.guestLeave(G, token, DATE), 'GAME_LINK_INVALID', 404);
  });

  it('caso 8: token desconhecido → GAME_LINK_INVALID', async () => {
    const t = await setup({ guestsOpenHoursBefore: 6 });
    await expectAppError(t.games.guestView(G, 'nope'), 'GAME_LINK_INVALID', 404);
    await expectAppError(t.games.guestView(G, tokenOf(t.group)), 'GAME_LINK_INVALID', 404);
  });

  it('caso 8: o dono liga convidados com 6 h → o mesmo link vale; antes de sexta 13h vê o jogo e confirmar dá GAME_LIST_NOT_OPEN', async () => {
    const t = await setup();
    const token = guestTokenOf(t.group);
    const updated = await t.groups.update(OWNER, t.group.id, { guestsOpenHoursBefore: 6 });
    expect(updated.guestsOpenHoursBefore).toBe(6);
    expect(updated.guestToken).toBe(token);

    const view = await t.games.guestView(G, token);
    expect(GuestGameSchema.parse(view)).toBeTruthy();
    expect(view.myRole).toBe('guest');
    expect(view.group).toMatchObject({
      id: t.group.id,
      name: INPUT.name,
      sport: INPUT.sport,
      weekday: INPUT.weekday,
      time: INPUT.time,
      timeZone: 'America/Sao_Paulo',
    });
    expect(view.group).not.toHaveProperty('inviteToken');
    expect(view.group).not.toHaveProperty('reserveInviteToken');
    expect(view.group).not.toHaveProperty('guestToken');
    expect(view.game.date).toBe(DATE);
    expect(iso(view.game.myOpensAt ?? '')).toBe(FRIDAY_13H.toISOString());
    expect(iso(view.game.guestsOpensAt ?? '')).toBe(FRIDAY_13H.toISOString());

    const err = await expectAppError(t.games.guestConfirm(G, token, DATE), 'GAME_LIST_NOT_OPEN', 409);
    expect(opensAtOf(err)).toBe(FRIDAY_13H.toISOString());
  });

  it('caso 8: a partir de sexta 13h o convidado confirma e aparece na lista com role guest', async () => {
    const t = await setup({ members: [A], guestsOpenHoursBefore: 6 });
    t.clock.now = FRIDAY_13H;
    await t.confirmInOrder(A);
    const game = await t.games.guestConfirm(G, guestTokenOf(t.group), DATE);
    expect(GameSchema.parse(game)).toBeTruthy();
    expect(game.confirmed.map((x) => [x.userId, x.name, x.role])).toEqual([
      [A, 'Ana', 'member'],
      [G, 'Gabi', 'guest'],
    ]);
    expect(game.me).toEqual({ list: 'confirmed', position: 2 });
    const seen = await t.games.current(OWNER, t.group.id);
    expect(seen.confirmed.find((x) => x.userId === G)?.role).toBe('guest');
    expect((await t.games.guestView(G, guestTokenOf(t.group))).game.me).toEqual({
      list: 'confirmed',
      position: 2,
    });
  });

  it('caso 9: convidado não vira membro: fora de members e de "meus grupos", e o grupo dá GROUP_NOT_FOUND', async () => {
    const t = await setup({ members: [A], reservesOpenHoursBefore: 48, guestsOpenHoursBefore: 48 });
    await t.guestConfirmInOrder(G);
    expect(ids(await t.groups.members(OWNER, t.group.id))).not.toContain(G);
    expect(await t.store.groups.roleOf(t.group.id, G)).toBeUndefined();
    expect(await t.groups.myGroups(G)).toEqual([]);
    await expectAppError(t.groups.get(G, t.group.id), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.groups.members(G, t.group.id), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.games.current(G, t.group.id), 'GROUP_NOT_FOUND', 404);
  });

  it('caso 9: convidado desiste pelo link → sai da lista; desistir de novo é ok', async () => {
    const t = await setup({ members: [A], reservesOpenHoursBefore: 48, guestsOpenHoursBefore: 48 });
    await t.confirmInOrder(A);
    await t.guestConfirmInOrder(G);
    const token = guestTokenOf(t.group);
    await expect(t.games.guestLeave(G, token, DATE)).resolves.toBeUndefined();
    expect(ids((await t.games.current(OWNER, t.group.id)).confirmed)).toEqual([A]);
    expect((await t.games.guestView(G, token)).game.me).toBeUndefined();
    await expect(t.games.guestLeave(G, token, DATE)).resolves.toBeUndefined();
  });

  it('caso 9: convidado dentro desiste → a fila sobe com aviso', async () => {
    const t = await setup({
      slots: 2,
      members: [A, B],
      reservesOpenHoursBefore: 48,
      guestsOpenHoursBefore: 48,
    });
    await t.confirmInOrder(A);
    await t.guestConfirmInOrder(G);
    await t.confirmInOrder(B);
    expect(ids((await t.games.current(B, t.group.id)).waitlist)).toEqual([B]);
    await t.games.guestLeave(G, guestTokenOf(t.group), DATE);
    const game = await t.games.current(B, t.group.id);
    expect(ids(game.confirmed)).toEqual([A, B]);
    expect(ofType(t.sent, 'waitlist_promoted')).toEqual([B]);
    expect(t.sent).toHaveLength(1);
  });

  it('caso 10: membro abre o link do jogo → myRole member e confirma pela camada dos membros', async () => {
    const t = await setup({ members: [A], guestsOpenHoursBefore: 6 });
    const token = guestTokenOf(t.group);
    const view = await t.games.guestView(A, token);
    expect(view.myRole).toBe('member');
    expect(iso(view.game.myOpensAt ?? '')).toBe(WEDNESDAY_19H.toISOString());
    expect((await t.games.guestView(OWNER, token)).myRole).toBe('member');
    const game = await t.games.guestConfirm(A, token, DATE);
    expect(game.confirmed.map((x) => [x.userId, x.role])).toEqual([[A, 'member']]);
    expect((await t.games.current(A, t.group.id)).me).toEqual({ list: 'confirmed', position: 1 });
  });

  it('caso 10: reserva abre o link do jogo → myRole reserve e vale a camada das reservas', async () => {
    const t = await setup({ reserves: [R], guestsOpenHoursBefore: 6 });
    const token = guestTokenOf(t.group);
    const view = await t.games.guestView(R, token);
    expect(view.myRole).toBe('reserve');
    expect(iso(view.game.myOpensAt ?? '')).toBe(THURSDAY_19H.toISOString());
    const err = await expectAppError(t.games.guestConfirm(R, token, DATE), 'GAME_LIST_NOT_OPEN', 409);
    expect(opensAtOf(err)).toBe(THURSDAY_19H.toISOString());
    t.clock.now = THURSDAY_19H;
    const game = await t.games.guestConfirm(R, token, DATE);
    expect(game.confirmed.map((x) => [x.userId, x.role])).toEqual([[R, 'reserve']]);
  });
});

describe('E2: troca dos links (caso 11)', () => {
  it('caso 11: dono troca o link de convidados → o antigo dá GAME_LINK_INVALID e o novo vale; os outros não mudam', async () => {
    const t = await setup({ guestsOpenHoursBefore: 6 });
    const old = guestTokenOf(t.group);
    const invite = await t.groups.rotateInvite(OWNER, t.group.id, 'guest');
    expect(InviteSchema.parse(invite)).toEqual(invite);
    expect(invite.kind).toBe('guest');
    expect(invite.token).not.toBe(old);
    await expectAppError(t.games.guestView(G, old), 'GAME_LINK_INVALID', 404);
    expect((await t.games.guestView(G, invite.token)).myRole).toBe('guest');
    const own = await t.groups.get(OWNER, t.group.id);
    expect(own.guestToken).toBe(invite.token);
    expect(own.inviteToken).toBe(tokenOf(t.group));
    expect(own.reserveInviteToken).toBe(reserveTokenOf(t.group));
  });

  it('caso 11: dono troca o link de reserva → o antigo dá GROUP_INVITE_INVALID; o de membro continua valendo', async () => {
    const t = await setup();
    const old = reserveTokenOf(t.group);
    const invite = await t.groups.rotateInvite(OWNER, t.group.id, 'reserve');
    expect(invite).toMatchObject({ kind: 'reserve' });
    expect(invite.token).not.toBe(old);
    await expectAppError(t.groups.acceptInvite(R, old), 'GROUP_INVITE_INVALID', 404);
    expect((await t.groups.acceptInvite(R, invite.token)).myRole).toBe('reserve');
    expect((await t.groups.acceptInvite(A, tokenOf(t.group))).myRole).toBe('member');
    const own = await t.groups.get(OWNER, t.group.id);
    expect(own.reserveInviteToken).toBe(invite.token);
    expect(own.inviteToken).toBe(tokenOf(t.group));
  });

  it('caso 11: membro ou reserva tenta trocar qualquer link → GROUP_NOT_OWNER e nada muda', async () => {
    const t = await setup({ members: [A], reserves: [R], guestsOpenHoursBefore: 6 });
    for (const id of [A, R]) {
      for (const kind of KINDS) {
        await expectAppError(t.groups.rotateInvite(id, t.group.id, kind), 'GROUP_NOT_OWNER', 403);
      }
    }
    const own = await t.groups.get(OWNER, t.group.id);
    expect([own.inviteToken, own.reserveInviteToken, own.guestToken]).toEqual([
      tokenOf(t.group),
      reserveTokenOf(t.group),
      guestTokenOf(t.group),
    ]);
  });

  it('caso 11: trocar o link de convidados com convidados desligados → GAME_LINK_INVALID', async () => {
    const t = await setup();
    await expectAppError(t.groups.rotateInvite(OWNER, t.group.id, 'guest'), 'GAME_LINK_INVALID', 404);
    expect((await t.groups.get(OWNER, t.group.id)).guestToken).toBe(guestTokenOf(t.group));
  });
});

describe('E2: remover reserva (caso 12)', () => {
  it('caso 12: dono remove reserva confirmada → ela perde o acesso e sai da lista; a fila sobe com aviso', async () => {
    const t = await setup({ slots: 2, reservesOpenHoursBefore: 48, members: [A, B], reserves: [R] });
    await t.confirmInOrder(A, R, B);
    await expect(t.groups.removeMember(OWNER, t.group.id, R)).resolves.toBeUndefined();
    await expectAppError(t.groups.get(R, t.group.id), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.games.current(R, t.group.id), 'GROUP_NOT_FOUND', 404);
    expect(await t.groups.myGroups(R)).toEqual([]);
    expect(ids(await t.groups.members(OWNER, t.group.id))).not.toContain(R);
    const game = await t.games.current(OWNER, t.group.id);
    expect(ids(game.confirmed)).toEqual([A, B]);
    expect(game.waitlist).toEqual([]);
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]).toMatchObject({ userId: B, type: 'waitlist_promoted' });
    expect(t.store.removeCalls.at(-1)).toMatchObject({ userId: R, role: 'reserve' });
  });

  it('caso 12: remover reserva troca o link de reserva e não o de membro', async () => {
    const t = await setup({ reserves: [R] });
    const oldReserve = reserveTokenOf(t.group);
    await t.groups.removeMember(OWNER, t.group.id, R);
    const own = await t.groups.get(OWNER, t.group.id);
    expect(own.inviteToken).toBe(tokenOf(t.group));
    expect(own.guestToken).toBe(guestTokenOf(t.group));
    expect(own.reserveInviteToken).toBeTypeOf('string');
    expect(own.reserveInviteToken).not.toBe(oldReserve);
    await expectAppError(t.groups.acceptInvite(R, oldReserve), 'GROUP_INVITE_INVALID', 404);
    expect((await t.groups.acceptInvite(OUTSIDER, own.reserveInviteToken ?? '')).myRole).toBe('reserve');
  });

  it('caso 12: remover membro continua trocando só o link de membro', async () => {
    const t = await setup({ members: [A] });
    await t.groups.removeMember(OWNER, t.group.id, A);
    const own = await t.groups.get(OWNER, t.group.id);
    expect(own.inviteToken).not.toBe(tokenOf(t.group));
    expect(own.reserveInviteToken).toBe(reserveTokenOf(t.group));
    expect(t.store.removeCalls.at(-1)).toMatchObject({ userId: A, role: 'member' });
  });
});

describe('E2: configurar as camadas (caso 13)', () => {
  it('caso 13: PATCH por membro ou reserva → GROUP_NOT_OWNER; não-membro → GROUP_NOT_FOUND', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    await expectAppError(
      t.groups.update(A, t.group.id, { listOpensHoursBefore: 30 }),
      'GROUP_NOT_OWNER',
      403,
    );
    await expectAppError(
      t.groups.update(R, t.group.id, { listOpensHoursBefore: 30 }),
      'GROUP_NOT_OWNER',
      403,
    );
    await expectAppError(
      t.groups.update(OUTSIDER, t.group.id, { listOpensHoursBefore: 30 }),
      'GROUP_NOT_FOUND',
      404,
    );
    expect((await t.groups.get(OWNER, t.group.id)).listOpensHoursBefore).toBe(48);
  });

  it('caso 13: { listOpensHoursBefore: 20 } com reservas 24 → GROUP_LAYERS_INVALID (reservesOpenHoursBefore) e nada muda', async () => {
    const t = await setup();
    const err = await expectAppError(
      t.groups.update(OWNER, t.group.id, { listOpensHoursBefore: 20 }),
      'GROUP_LAYERS_INVALID',
      422,
    );
    expect(fieldOf(err)).toBe('reservesOpenHoursBefore');
    expect(await t.groups.get(OWNER, t.group.id)).toMatchObject({
      listOpensHoursBefore: 48,
      reservesOpenHoursBefore: 24,
    });
  });

  it('caso 13: convidados acima das reservas → GROUP_LAYERS_INVALID (guestsOpenHoursBefore)', async () => {
    const t = await setup();
    const err = await expectAppError(
      t.groups.update(OWNER, t.group.id, { guestsOpenHoursBefore: 30 }),
      'GROUP_LAYERS_INVALID',
      422,
    );
    expect(fieldOf(err)).toBe('guestsOpenHoursBefore');
    expect((await t.groups.get(OWNER, t.group.id)).guestsOpenHoursBefore).toBeUndefined();
  });

  it('caso 13: PATCH válido junta com o atual e devolve o grupo do dono; o jogo usa a nova abertura', async () => {
    const t = await setup({ members: [A] });
    const updated = await t.groups.update(OWNER, t.group.id, { listOpensHoursBefore: 30 });
    expect(GroupSchema.parse(updated)).toEqual(updated);
    expect(updated).toMatchObject({
      listOpensHoursBefore: 30,
      reservesOpenHoursBefore: 24,
      myRole: 'member',
    });
    expect(updated.inviteToken).toBe(tokenOf(t.group));
    expect(iso((await t.games.current(A, t.group.id)).opensAt)).toBe('2026-11-05T16:00:00.000Z');
  });

  it('caso 13: { guestsOpenHoursBefore: null } desliga os convidados', async () => {
    const t = await setup({ members: [A], guestsOpenHoursBefore: 6 });
    const token = guestTokenOf(t.group);
    expect((await t.games.guestView(G, token)).myRole).toBe('guest');
    const updated = await t.groups.update(OWNER, t.group.id, { guestsOpenHoursBefore: null });
    expect(updated.guestsOpenHoursBefore).toBeUndefined();
    await expectAppError(t.games.guestView(G, token), 'GAME_LINK_INVALID', 404);
    expect((await t.games.current(A, t.group.id)).guestsOpensAt).toBeUndefined();
  });

  it('caso 13 (contrato): PATCH vazio é inválido; null em convidados é aceito; GroupLayersSchema aponta o campo', () => {
    expect(UpdateGroupInputSchema.safeParse({}).success).toBe(false);
    expect(UpdateGroupInputSchema.safeParse({ guestsOpenHoursBefore: null }).success).toBe(true);
    const layers = GroupLayersSchema.safeParse({ listOpensHoursBefore: 20, reservesOpenHoursBefore: 24 });
    expect(layers.error?.issues.map((i) => i.path)).toEqual([['reservesOpenHoursBefore']]);
  });
});

describe('E2: grupo de antes da E2 (caso 14, D3 e D6)', () => {
  const LEGACY_TOKEN = 'legacy-member-token';

  async function legacySetup() {
    const s = setupServices();
    const id = randomUUID();
    s.store.seedLegacy({
      id,
      createdAt: '2026-10-01T00:00:00.000Z',
      name: 'Vôlei antigo',
      sport: 'volleyball',
      weekday: 5,
      time: '19:00',
      timeZone: 'America/Sao_Paulo',
      slots: 12,
      listOpensHoursBefore: 48,
      ownerId: OWNER,
      inviteToken: LEGACY_TOKEN,
    });
    return { ...s, id };
  }

  it('caso 14: lido com reservas = membros e convidados desligados', async () => {
    const t = await legacySetup();
    const own = await t.groups.get(OWNER, t.id);
    expect(GroupSchema.parse(own)).toBeTruthy();
    expect(own).toMatchObject({ listOpensHoursBefore: 48, reservesOpenHoursBefore: 48, myRole: 'member' });
    expect(own.guestsOpenHoursBefore).toBeUndefined();
    expect(own.inviteToken).toBe(LEGACY_TOKEN);
    expect(own.reserveInviteToken).toBeUndefined();
    expect(own.guestToken).toBeUndefined();
    const game = await t.games.current(OWNER, t.id);
    expect(GameSchema.parse(game)).toBeTruthy();
    expect(iso(game.reservesOpensAt)).toBe(iso(game.opensAt));
    expect(game.guestsOpensAt).toBeUndefined();
    expect((await t.groups.acceptInvite(A, LEGACY_TOKEN)).myRole).toBe('member');
  });

  it('caso 14: o dono gera o link de reserva pela troca e ele passa a valer', async () => {
    const t = await legacySetup();
    const invite = await t.groups.rotateInvite(OWNER, t.id, 'reserve');
    expect(invite.kind).toBe('reserve');
    const joined = await t.groups.acceptInvite(R, invite.token);
    expect(joined).toMatchObject({ id: t.id, myRole: 'reserve' });
    const own = await t.groups.get(OWNER, t.id);
    expect(own.reserveInviteToken).toBe(invite.token);
    expect(own.inviteToken).toBe(LEGACY_TOKEN);
  });

  it('caso 14: o link do jogo só sai depois de ligar os convidados', async () => {
    const t = await legacySetup();
    await expectAppError(t.groups.rotateInvite(OWNER, t.id, 'guest'), 'GAME_LINK_INVALID', 404);
    await t.groups.update(OWNER, t.id, { guestsOpenHoursBefore: 6 });
    const invite = await t.groups.rotateInvite(OWNER, t.id, 'guest');
    expect((await t.games.guestView(G, invite.token)).myRole).toBe('guest');
  });
});

describe('E2: o que a reserva vê e faz (caso 15)', () => {
  it('caso 15: reserva vê a página do grupo, os membros e o jogo, sem os tokens', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    const seen = await t.groups.get(R, t.group.id);
    expect(seen).toMatchObject({ id: t.group.id, myRole: 'reserve' });
    noTokens(seen);
    expect(ids(await t.groups.members(R, t.group.id))).toEqual([OWNER, A, R]);
    const game = await t.games.current(R, t.group.id);
    expect(game.groupId).toBe(t.group.id);
  });

  it('caso 15: reserva não remove ninguém (GROUP_NOT_OWNER) e ninguém sai', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    await expectAppError(t.groups.removeMember(R, t.group.id, A), 'GROUP_NOT_OWNER', 403);
    await expectAppError(t.groups.removeMember(R, t.group.id, R), 'GROUP_NOT_OWNER', 403);
    expect(ids(await t.groups.members(OWNER, t.group.id))).toEqual([OWNER, A, R]);
  });

  it('caso 15: reserva não cancela o jogo (GROUP_NOT_OWNER)', async () => {
    const t = await setup({ reserves: [R] });
    await expectAppError(t.games.cancel(R, t.group.id, DATE), 'GROUP_NOT_OWNER', 403);
  });
});

// ---------------------------------------------------------------------------------------------
// Plano 013: a participação no grupo vira entidade (`Membership`). Nenhuma rota muda; o que muda é
// a data de entrada preservada, o "meus grupos" pelo `groupsOf` e a ordem por entrada dentro do papel.
// ---------------------------------------------------------------------------------------------

/** Entra pelo link do `kind`, um por vez, avançando o relógio 1 min antes de cada entrada. */
async function joinInOrder(
  t: Awaited<ReturnType<typeof setup>>,
  kind: 'member' | 'reserve',
  ...users: string[]
) {
  const token = kind === 'member' ? tokenOf(t.group) : reserveTokenOf(t.group);
  for (const id of users) {
    t.tick();
    await t.groups.acceptInvite(id, token);
  }
}

const roles = (list: { userId: string; role: MemberRole | 'guest' }[]) => list.map((m) => [m.userId, m.role]);

describe('plano 013: entrar e o papel (casos 1–7)', () => {
  it('caso 1: dono cria → membro e dono na lista, grupo nos grupos dele, papel member e entrada = criação', async () => {
    const s = setupServices();
    const group = await s.groups.create(OWNER, INPUT);
    expect(await s.groups.members(OWNER, group.id)).toEqual([
      { userId: OWNER, name: 'Dono', isOwner: true, role: 'member' },
    ]);
    expect((await s.groups.myGroups(OWNER)).map((g) => [g.id, g.myRole])).toEqual([[group.id, 'member']]);
    expect(await s.store.groups.roleOf(group.id, OWNER)).toBe('member');
    expect(s.store.membershipOf(group.id, OWNER)).toEqual({
      userId: OWNER,
      role: 'member',
      createdAt: THURSDAY_10H.toISOString(),
    });
  });

  it('caso 2: entra pelo link de membro → papel member e o grupo aparece nos grupos dele', async () => {
    const t = await setup();
    const joined = await t.groups.acceptInvite(A, tokenOf(t.group));
    expect(joined.myRole).toBe('member');
    expect(await t.store.groups.roleOf(t.group.id, A)).toBe('member');
    expect((await t.groups.myGroups(A)).map((g) => [g.id, g.myRole])).toEqual([[t.group.id, 'member']]);
    expect(t.store.membershipOf(t.group.id, A)?.createdAt).toBe(THURSDAY_10H.toISOString());
  });

  it('caso 3: entra pelo link de reserva → papel reserve', async () => {
    const t = await setup();
    const joined = await t.groups.acceptInvite(R, reserveTokenOf(t.group));
    expect(joined.myRole).toBe('reserve');
    expect(await t.store.groups.roleOf(t.group.id, R)).toBe('reserve');
    expect((await t.groups.myGroups(R)).map((g) => [g.id, g.myRole])).toEqual([[t.group.id, 'reserve']]);
  });

  it('caso 4: membro usa o link de membro de novo → nada muda (nem a entrada) e myRole member', async () => {
    const t = await setup({ members: [A] });
    const before = t.store.membershipOf(t.group.id, A);
    t.tick();
    const again = await t.groups.acceptInvite(A, tokenOf(t.group));
    expect(again.myRole).toBe('member');
    expect(t.store.membershipOf(t.group.id, A)).toEqual(before);
    expect(ids(await t.groups.members(OWNER, t.group.id))).toEqual([OWNER, A]);
    expect(await t.groups.myGroups(A)).toHaveLength(1);
  });

  it('caso 5: membro usa o link de reserva → continua member, sem roleChangedAt', async () => {
    const t = await setup({ members: [A] });
    const before = t.store.membershipOf(t.group.id, A);
    t.tick();
    expect((await t.groups.acceptInvite(A, reserveTokenOf(t.group))).myRole).toBe('member');
    expect(t.store.membershipOf(t.group.id, A)).toEqual(before);
    expect(t.store.membershipOf(t.group.id, A)?.roleChangedAt).toBeUndefined();
  });

  it('caso 6: reserva entra pelo link de membro → member, mantém a entrada original e grava roleChangedAt', async () => {
    const t = await setup();
    await joinInOrder(t, 'reserve', R);
    const joinedAt = t.clock.now.toISOString();
    await joinInOrder(t, 'member', A);
    t.tick();
    const promotedAt = t.clock.now.toISOString();
    const joined = await t.groups.acceptInvite(R, tokenOf(t.group));
    expect(joined.myRole).toBe('member');
    expect(t.store.membershipOf(t.group.id, R)).toEqual({
      userId: R,
      role: 'member',
      createdAt: joinedAt,
      roleChangedAt: promotedAt,
    });
    // A data de entrada preservada vale na ordem: R entrou antes de A.
    expect(roles(await t.groups.members(OWNER, t.group.id))).toEqual([
      [OWNER, 'member'],
      [R, 'member'],
      [A, 'member'],
    ]);
  });

  it('caso 7: duas entradas simultâneas pelo mesmo link → uma participação só e nenhuma dá erro', async () => {
    const t = await setup();
    const [first, second] = await Promise.all([
      t.groups.acceptInvite(A, tokenOf(t.group)),
      t.groups.acceptInvite(A, tokenOf(t.group)),
    ]);
    expect([first.myRole, second.myRole]).toEqual(['member', 'member']);
    const [r1, r2] = await Promise.all([
      t.groups.acceptInvite(R, reserveTokenOf(t.group)),
      t.groups.acceptInvite(R, reserveTokenOf(t.group)),
    ]);
    expect([r1.myRole, r2.myRole]).toEqual(['reserve', 'reserve']);
    expect(ids(await t.groups.members(OWNER, t.group.id))).toEqual([OWNER, A, R]);
    expect(await t.groups.myGroups(A)).toHaveLength(1);
    expect(await t.groups.myGroups(R)).toHaveLength(1);
  });
});

describe('plano 013: meus grupos e lista de membros (casos 8–10)', () => {
  it('caso 8: membro em 2 grupos e reserva em 1 → vêm os 3, cada um com o myRole certo', async () => {
    const t = await setup({ members: [A] });
    const second = await t.groups.create(OWNER, {
      ...INPUT,
      name: 'Futebol de terça',
      sport: 'soccer',
      weekday: 2,
    });
    const third = await t.groups.create(OWNER, { ...INPUT, name: 'Basquete de domingo', weekday: 0 });
    await t.groups.acceptInvite(A, tokenOf(second));
    await t.groups.acceptInvite(A, reserveTokenOf(third));

    const mine = await t.groups.myGroups(A);
    for (const g of mine) expect(MyGroupSchema.parse(g)).toBeTruthy();
    const byId = (list: [string, string | undefined][]) => list.sort(([x], [y]) => x.localeCompare(y));
    expect(byId(mine.map((g) => [g.id, g.myRole]))).toEqual(
      byId([
        [t.group.id, 'member'],
        [second.id, 'member'],
        [third.id, 'reserve'],
      ]),
    );
  });

  it('caso 8 (D7): "meus grupos" usa o groupsOf, sem get nem roleOf por grupo', async () => {
    const t = await setup({ members: [A] });
    const second = await t.groups.create(OWNER, {
      ...INPUT,
      name: 'Futebol de terça',
      sport: 'soccer',
      weekday: 2,
    });
    await t.groups.acceptInvite(A, reserveTokenOf(second));
    const before = { ...t.store.reads };
    expect(await t.groups.myGroups(A)).toHaveLength(2);
    expect(t.store.reads.groupsOf - before.groupsOf).toBe(1);
    expect(t.store.reads.get - before.get).toBe(0);
    expect(t.store.reads.roleOf - before.roleOf).toBe(0);
  });

  it('caso 9: usuário sem grupo → lista vazia', async () => {
    const t = await setup({ members: [A] });
    expect(await t.groups.myGroups(OUTSIDER)).toEqual([]);
  });

  it('caso 10: dono, 2 membros e 2 reservas → dono, membros e reservas, cada papel por ordem de entrada', async () => {
    const t = await setup();
    // Ordem de entrada diferente da ordem dos ids (D > A e R > C): a lista não pode sair pelo userId.
    await joinInOrder(t, 'reserve', R);
    await joinInOrder(t, 'member', D);
    await joinInOrder(t, 'reserve', C);
    await joinInOrder(t, 'member', A);
    const list = await t.groups.members(A, t.group.id);
    expect(roles(list)).toEqual([
      [OWNER, 'member'],
      [D, 'member'],
      [A, 'member'],
      [R, 'reserve'],
      [C, 'reserve'],
    ]);
    expect(list[0]?.isOwner).toBe(true);
    expect(list.slice(1).every((m) => !m.isOwner)).toBe(true);
  });
});

describe('plano 013: remover (casos 11–14)', () => {
  it('caso 11: dono remove membro → sai da lista e dos grupos dele, link de membro trocado e presença apagada', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    const before = await t.groups.get(OWNER, t.group.id);
    await expect(t.groups.removeMember(OWNER, t.group.id, A)).resolves.toBeUndefined();

    expect(ids(await t.groups.members(OWNER, t.group.id))).toEqual([OWNER, B, C]);
    expect(await t.groups.myGroups(A)).toEqual([]);
    expect(await t.store.groups.roleOf(t.group.id, A)).toBeUndefined();
    expect(t.store.membershipOf(t.group.id, A)).toBeUndefined();
    const after = await t.groups.get(OWNER, t.group.id);
    expect(after.inviteToken).not.toBe(before.inviteToken);
    expect(after.reserveInviteToken).toBe(before.reserveInviteToken);
    expect(t.store.removeCalls.at(-1)).toMatchObject({ userId: A, role: 'member' });
    const game = await t.games.current(OWNER, t.group.id);
    expect(ids(game.confirmed)).toEqual([B, C]);
    expect(game.waitlist).toEqual([]);
  });

  it('caso 12: o membro já foi removido por outra requisição → GROUP_MEMBER_NOT_FOUND e nada muda', async () => {
    const t = await setup({ members: [A, B] });
    t.store.removeScript.push((args) => {
      t.store.drop(args.group.id, args.userId);
      return t.store.naturalRemove(args);
    });
    await expectAppError(t.groups.removeMember(OWNER, t.group.id, B), 'GROUP_MEMBER_NOT_FOUND', 404);
    expect(t.store.removeCalls).toHaveLength(1);
    expect((await t.groups.get(OWNER, t.group.id)).inviteToken).toBe(tokenOf(t.group));
    expect(t.sent).toEqual([]);
  });

  it('caso 13: reserva promovida no meio da remoção → relê e remove como member, trocando o link de membro', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    t.store.removeScript.push((args) => {
      t.store.promote(args.group.id, R);
      return t.store.naturalRemove(args);
    });

    await expect(t.groups.removeMember(OWNER, t.group.id, R)).resolves.toBeUndefined();

    expect(t.store.removeCalls.map((c) => [c.userId, c.role])).toEqual([
      [R, 'reserve'],
      [R, 'member'],
    ]);
    expect(t.store.membershipOf(t.group.id, R)).toBeUndefined();
    expect(ids(await t.groups.members(OWNER, t.group.id))).toEqual([OWNER, A]);
    const after = await t.groups.get(OWNER, t.group.id);
    expect(after.inviteToken).not.toBe(tokenOf(t.group));
    expect(after.reserveInviteToken).toBe(reserveTokenOf(t.group));
  });

  it('caso 14: removido tenta abrir o grupo → GROUP_NOT_FOUND', async () => {
    const t = await setup({ members: [A] });
    await t.groups.removeMember(OWNER, t.group.id, A);
    await expectAppError(t.groups.get(A, t.group.id), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.groups.members(A, t.group.id), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.games.current(A, t.group.id), 'GROUP_NOT_FOUND', 404);
  });
});

describe('plano 013: papel no link do jogo e na fila (casos 15 e 16)', () => {
  it('caso 15: convidado que não participa → guest; membro e reserva → o papel deles', async () => {
    const t = await setup({ members: [A], reserves: [R], guestsOpenHoursBefore: 6 });
    const token = guestTokenOf(t.group);
    expect((await t.games.guestView(G, token)).myRole).toBe('guest');
    expect((await t.games.guestView(A, token)).myRole).toBe('member');
    expect((await t.games.guestView(R, token)).myRole).toBe('reserve');
    expect((await t.games.guestView(OWNER, token)).myRole).toBe('member');
  });

  it('caso 15: depois de removido, o link do jogo trata como guest', async () => {
    const t = await setup({ members: [A], guestsOpenHoursBefore: 6 });
    await t.groups.removeMember(OWNER, t.group.id, A);
    expect((await t.games.guestView(A, guestTokenOf(t.group))).myRole).toBe('guest');
  });

  it('caso 16: promoção da fila → a reserva promovida é notificada e mantém o papel reserve', async () => {
    const t = await setup({ slots: 2, reservesOpenHoursBefore: 48, members: [A, B], reserves: [R] });
    await t.confirmInOrder(A, B, R);
    await t.games.leave(A, t.group.id, DATE);
    const game = await t.games.current(OWNER, t.group.id);
    expect(roles(game.confirmed)).toEqual([
      [B, 'member'],
      [R, 'reserve'],
    ]);
    expect(game.waitlist).toEqual([]);
    expect(ofType(t.sent, 'waitlist_promoted')).toEqual([R]);
  });
});

/** Pedido do painel de criar grupo (GRP-34): só nome, esporte, dia, horário e vagas, sem nenhuma camada. */
const { listOpensHoursBefore: _omitted, ...PANEL_INPUT } = INPUT;

describe('criar grupo com os padrões da api (GRP-15)', () => {
  it('GRP-15: o contrato aceita criar sem nenhuma camada', () => {
    const result = CreateGroupInputSchema.safeParse(PANEL_INPUT);
    expect(result.success).toBe(true);
    expect(result.data?.listOpensHoursBefore).toBeUndefined();
  });

  it('GRP-15: sem nenhuma camada → membros 48h, reservas 24h e convidados desligados', async () => {
    const s = setupServices();
    const group = await s.groups.create(OWNER, PANEL_INPUT);
    expect(GroupSchema.parse(group)).toEqual(group);
    expect(group.listOpensHoursBefore).toBe(48);
    expect(group.reservesOpenHoursBefore).toBe(24);
    expect(group.guestsOpenHoursBefore).toBeUndefined();
  });

  it('GRP-15: os padrões ficam gravados (a leitura depois devolve 48h / 24h / desligado)', async () => {
    const s = setupServices();
    const created = await s.groups.create(OWNER, PANEL_INPUT);
    const read = await s.groups.get(OWNER, created.id);
    expect(read).toMatchObject({ listOpensHoursBefore: 48, reservesOpenHoursBefore: 24 });
    expect(read.guestsOpenHoursBefore).toBeUndefined();
  });

  it('GRP-15: sem camadas, a lista dos membros abre 48h antes e a das reservas 24h antes', async () => {
    const s = setupServices();
    const group = await s.groups.create(OWNER, PANEL_INPUT);
    await s.groups.acceptInvite(A, tokenOf(group));
    await s.groups.acceptInvite(R, reserveTokenOf(group));
    // Quinta 10h, 33h antes de sexta 19h: o membro (48h) confirma; a reserva (24h) só a partir de quinta 19h.
    await s.games.confirm(A, group.id, DATE);
    const err = await expectAppError(s.games.confirm(R, group.id, DATE), 'GAME_LIST_NOT_OPEN', 409);
    expect(opensAtOf(err)).toBe(THURSDAY_19H.toISOString());
  });

  it('GRP-15: com os membros e sem as reservas → reservas na metade, arredondando para baixo (25 → 12)', async () => {
    const s = setupServices();
    const group = await s.groups.create(OWNER, { ...PANEL_INPUT, listOpensHoursBefore: 25 });
    expect(group).toMatchObject({ listOpensHoursBefore: 25, reservesOpenHoursBefore: 12 });
    expect(group.guestsOpenHoursBefore).toBeUndefined();
  });

  it('GRP-15: com os membros e sem as reservas, 72h → reservas 36h (não o padrão de 24h)', async () => {
    const s = setupServices();
    const group = await s.groups.create(OWNER, { ...PANEL_INPUT, listOpensHoursBefore: 72 });
    expect(group).toMatchObject({ listOpensHoursBefore: 72, reservesOpenHoursBefore: 36 });
  });

  it('GRP-15: só os convidados no pedido → membros 48h e reservas 24h, e os convidados gravados', async () => {
    const s = setupServices();
    const group = await s.groups.create(OWNER, { ...PANEL_INPUT, guestsOpenHoursBefore: 12 });
    expect(group).toMatchObject({
      listOpensHoursBefore: 48,
      reservesOpenHoursBefore: 24,
      guestsOpenHoursBefore: 12,
    });
  });

  it('GRP-15: sem os membros e com as reservas dentro do limite (40) → membros 48h e as reservas que vieram', async () => {
    const s = setupServices();
    const group = await s.groups.create(OWNER, { ...PANEL_INPUT, reservesOpenHoursBefore: 40 });
    expect(group).toMatchObject({ listOpensHoursBefore: 48, reservesOpenHoursBefore: 40 });
    expect(group.guestsOpenHoursBefore).toBeUndefined();
    const read = await s.groups.get(OWNER, group.id);
    expect(read).toMatchObject({ listOpensHoursBefore: 48, reservesOpenHoursBefore: 40 });
  });

  it('GRP-15: sem os membros, com reservas e convidados → membros 48h e as duas camadas que vieram', async () => {
    const s = setupServices();
    const group = await s.groups.create(OWNER, {
      ...PANEL_INPUT,
      reservesOpenHoursBefore: 30,
      guestsOpenHoursBefore: 6,
    });
    expect(group).toMatchObject({
      listOpensHoursBefore: 48,
      reservesOpenHoursBefore: 30,
      guestsOpenHoursBefore: 6,
    });
  });

  it('GRP-15: sem os membros e com reservas acima de 48h (50) → GROUP_LAYERS_INVALID (reservesOpenHoursBefore) e não cria', async () => {
    const s = setupServices();
    const err = await expectAppError(
      s.groups.create(OWNER, { ...PANEL_INPUT, reservesOpenHoursBefore: 50 }),
      'GROUP_LAYERS_INVALID',
      422,
    );
    expect(fieldOf(err)).toBe('reservesOpenHoursBefore');
    expect(await s.groups.myGroups(OWNER)).toEqual([]);
  });

  it('GRP-14: só os convidados, acima das reservas padrão (30 > 24) → GROUP_LAYERS_INVALID e não cria', async () => {
    const s = setupServices();
    const err = await expectAppError(
      s.groups.create(OWNER, { ...PANEL_INPUT, guestsOpenHoursBefore: 30 }),
      'GROUP_LAYERS_INVALID',
      422,
    );
    expect(fieldOf(err)).toBe('guestsOpenHoursBefore');
    expect(await s.groups.myGroups(OWNER)).toEqual([]);
  });
});

// Arquivar e desarquivar (.claude/work/arquivar-grupo.md): GRP-31, GRP-32, GRP-33 e a corrida da GRP-24.

const minutesAfter = (d: Date, minutes: number) => new Date(d.getTime() + minutes * MINUTE);

/** Os 3 tokens do grupo como o dono via antes de arquivar. */
const tokensOf = (g: Group) => ({
  member: tokenOf(g),
  reserve: reserveTokenOf(g),
  guest: guestTokenOf(g),
});

describe('arquivar o grupo (GRP-31)', () => {
  it('GRP-31: o dono arquiva → devolve o grupo com archivedAt do relógio e sem os 3 links', async () => {
    const t = await setup({ members: [A] });
    const archived = await t.groups.archive(OWNER, t.group.id);
    expect(GroupSchema.parse(archived)).toEqual(archived);
    expect(archived.id).toBe(t.group.id);
    expect(archived.archivedAt).toBe(THURSDAY_10H.toISOString());
    noTokens(archived);
    expect(t.store.storedGroup(t.group.id)?.archivedAt).toBe(THURSDAY_10H.toISOString());
  });

  it('GRP-31: membro ou reserva tenta arquivar → GROUP_NOT_OWNER; quem não participa → GROUP_NOT_FOUND; nada muda', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    await expectAppError(t.groups.archive(A, t.group.id), 'GROUP_NOT_OWNER', 403);
    await expectAppError(t.groups.archive(R, t.group.id), 'GROUP_NOT_OWNER', 403);
    await expectAppError(t.groups.archive(OUTSIDER, t.group.id), 'GROUP_NOT_FOUND', 404);
    expect(t.store.storedGroup(t.group.id)?.archivedAt).toBeUndefined();
    expect(t.store.archiveCalls).toEqual([]);
    expect((await t.groups.myGroups(A)).map((g) => g.id)).toEqual([t.group.id]);
  });

  it('GRP-31: o grupo sai de "meus grupos" de todos e aparece só nos arquivados', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    const other = await t.groups.create(OWNER, { ...INPUT, name: 'Futebol' });
    await t.groups.archive(OWNER, t.group.id);
    expect((await t.groups.myGroups(OWNER)).map((g) => g.id)).toEqual([other.id]);
    expect(await t.groups.myGroups(A)).toEqual([]);
    expect(await t.groups.myGroups(R)).toEqual([]);
    for (const who of [OWNER, A, R]) {
      const list = await t.groups.archivedGroups(who);
      expect(list.map((g) => g.id)).toEqual([t.group.id]);
      expect(list.every((g) => GroupSchema.parse(g) !== undefined)).toBe(true);
      expect(list[0]?.archivedAt).toBe(THURSDAY_10H.toISOString());
    }
    expect(await t.groups.archivedGroups(OUTSIDER)).toEqual([]);
  });

  it('GRP-31: a lista de arquivados vai do arquivado mais recente para o mais antigo', async () => {
    const t = await setup();
    const second = await t.groups.create(OWNER, { ...INPUT, name: 'Futebol' });
    const third = await t.groups.create(OWNER, { ...INPUT, name: 'Basquete' });
    await t.groups.archive(OWNER, second.id);
    t.clock.now = minutesAfter(THURSDAY_10H, 5);
    await t.groups.archive(OWNER, t.group.id);
    t.clock.now = minutesAfter(THURSDAY_10H, 10);
    await t.groups.archive(OWNER, third.id);
    expect((await t.groups.archivedGroups(OWNER)).map((g) => g.id)).toEqual([
      third.id,
      t.group.id,
      second.id,
    ]);
    expect(await t.groups.myGroups(OWNER)).toEqual([]);
  });

  it('GRP-31: os três links param de funcionar na hora', async () => {
    const t = await setup({ guestsOpenHoursBefore: 6 });
    const old = tokensOf(t.group);
    await t.groups.archive(OWNER, t.group.id);
    await expectAppError(t.groups.acceptInvite(A, old.member), 'GROUP_INVITE_INVALID', 404);
    await expectAppError(t.groups.acceptInvite(R, old.reserve), 'GROUP_INVITE_INVALID', 404);
    await expectAppError(t.games.guestView(G, old.guest), 'GAME_LINK_INVALID', 404);
    expect(ids(await t.groups.members(OWNER, t.group.id))).toEqual([OWNER]);
  });

  it('GRP-31: jogo open com lista e fila → cancelado, e todos da lista (menos o dono) recebem game_cancelled', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(OWNER, A, B, C);
    await t.groups.archive(OWNER, t.group.id);
    expect(
      (await t.store.games.findByDate(t.group.id, DATE, { consistent: true }))?.cancelledAt,
    ).toBeDefined();
    expect(ofType(t.sent, 'game_cancelled').sort()).toEqual([A, B, C].sort());
  });

  it('GRP-31: jogo scheduled com lista → cancelado com o aviso', async () => {
    const t = await setup({ members: [A], listOpensHoursBefore: 48 });
    await t.confirmInOrder(A);
    await t.groups.update(OWNER, t.group.id, { listOpensHoursBefore: 24, reservesOpenHoursBefore: 24 });
    expect((await t.games.current(A, t.group.id)).status).toBe('scheduled');
    await t.groups.archive(OWNER, t.group.id);
    expect(
      (await t.store.games.findByDate(t.group.id, DATE, { consistent: true }))?.cancelledAt,
    ).toBeDefined();
    expect(ofType(t.sent, 'game_cancelled')).toEqual([A]);
  });

  it('GRP-31: jogo sem ninguém na lista → arquiva sem avisar ninguém', async () => {
    const t = await setup({ members: [A] });
    await t.groups.archive(OWNER, t.group.id);
    expect(t.sent).toEqual([]);
    expect(t.store.storedGroup(t.group.id)?.archivedAt).toBeDefined();
  });

  it('GRP-31: jogo in_progress → fica como está, sem cancelamento nem aviso', async () => {
    const t = await setup({ members: [A] });
    await t.confirmInOrder(A);
    t.clock.now = FRIDAY_20H;
    const archived = await t.groups.archive(OWNER, t.group.id);
    expect(archived.archivedAt).toBe(FRIDAY_20H.toISOString());
    expect(
      (await t.store.games.findByDate(t.group.id, DATE, { consistent: true }))?.cancelledAt,
    ).toBeUndefined();
    expect(ofType(t.sent, 'game_cancelled')).toEqual([]);
  });

  it('GRP-31: membros e reservas continuam no grupo, com os mesmos papéis e datas', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    const before = [OWNER, A, R].map((id) => t.store.membershipOf(t.group.id, id));
    const membersBefore = await t.groups.members(OWNER, t.group.id);
    t.tick();
    await t.groups.archive(OWNER, t.group.id);
    expect([OWNER, A, R].map((id) => t.store.membershipOf(t.group.id, id))).toEqual(before);
    expect(await t.groups.members(OWNER, t.group.id)).toEqual(membersBefore);
  });

  it('GRP-31: arquivar de novo não muda a data de arquivamento nem avisa outra vez', async () => {
    const t = await setup({ members: [A] });
    await t.confirmInOrder(A);
    const first = await t.groups.archive(OWNER, t.group.id);
    t.tick();
    const second = await t.groups.archive(OWNER, t.group.id);
    expect(second.archivedAt).toBe(first.archivedAt);
    expect(t.store.storedGroup(t.group.id)?.archivedAt).toBe(first.archivedAt);
    expect(t.store.archiveCalls).toHaveLength(1);
    expect(ofType(t.sent, 'game_cancelled')).toEqual([A]);
  });

  it('GRP-31: arquivar de novo cancela o jogo que ficou sem cancelar (com o aviso), sem regravar o grupo', async () => {
    const t = await setup({ members: [A] });
    await t.confirmInOrder(A);
    const archivedAt = THURSDAY_10H.toISOString();
    t.store.forceArchive(t.group.id, archivedAt);
    t.tick();
    const again = await t.groups.archive(OWNER, t.group.id);
    expect(again.archivedAt).toBe(archivedAt);
    expect(t.store.archiveCalls).toEqual([]);
    expect(
      (await t.store.games.findByDate(t.group.id, DATE, { consistent: true }))?.cancelledAt,
    ).toBeDefined();
    expect(ofType(t.sent, 'game_cancelled')).toEqual([A]);
  });

  it('GRP-31: link trocado no meio (stale e depois archived) → relê e arquiva com os tokens novos', async () => {
    const t = await setup({ members: [A] });
    t.store.archiveScript.push((group) => {
      t.store.swapToken(group.id, 'member', 'rotated-in-between');
      return 'stale';
    });
    const archived = await t.groups.archive(OWNER, t.group.id);
    expect(archived.archivedAt).toBeDefined();
    expect(t.store.archiveCalls).toHaveLength(2);
    expect(t.store.archiveCalls[1]?.group.inviteToken).toBe('rotated-in-between');
    await expectAppError(t.groups.acceptInvite(B, 'rotated-in-between'), 'GROUP_INVITE_INVALID', 404);
  });

  it('GRP-31: stale 3 vezes → erro comum (500), não appError, e nada muda', async () => {
    const t = await setup({ members: [A] });
    await t.confirmInOrder(A);
    for (const _ of [1, 2, 3, 4]) t.store.archiveScript.push(() => 'stale');
    const err = await t.groups.archive(OWNER, t.group.id).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(AppError);
    expect(t.store.archiveCalls).toHaveLength(3);
    expect(t.store.storedGroup(t.group.id)?.archivedAt).toBeUndefined();
    expect((await t.groups.myGroups(A)).map((g) => g.id)).toEqual([t.group.id]);
  });
});

describe('grupo arquivado é só leitura (GRP-32)', () => {
  it('GRP-32: membro e reserva leem o grupo (com archivedAt) e a lista de membros', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    await t.groups.archive(OWNER, t.group.id);
    for (const who of [OWNER, A, R]) {
      const seen = await t.groups.get(who, t.group.id);
      expect(seen.archivedAt).toBe(THURSDAY_10H.toISOString());
      noTokens(seen);
      expect(ids(await t.groups.members(who, t.group.id))).toEqual([OWNER, A, R]);
    }
  });

  it('GRP-32: quem não participa continua recebendo GROUP_NOT_FOUND (GRP-04 vem antes)', async () => {
    const t = await setup({ members: [A] });
    await t.groups.archive(OWNER, t.group.id);
    await expectAppError(t.groups.get(OUTSIDER, t.group.id), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.games.current(OUTSIDER, t.group.id), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.games.confirm(OUTSIDER, t.group.id, DATE), 'GROUP_NOT_FOUND', 404);
  });

  it('GRP-32: pedir o jogo atual, confirmar e desistir → GROUP_ARCHIVED (409)', async () => {
    const t = await setup({ members: [A, B], reserves: [R] });
    await t.confirmInOrder(A);
    await t.groups.archive(OWNER, t.group.id);
    await expectAppError(t.games.current(A, t.group.id), 'GROUP_ARCHIVED', 409);
    await expectAppError(t.games.current(R, t.group.id), 'GROUP_ARCHIVED', 409);
    await expectAppError(t.games.confirm(B, t.group.id, DATE), 'GROUP_ARCHIVED', 409);
    await expectAppError(t.games.leave(A, t.group.id, DATE), 'GROUP_ARCHIVED', 409);
    expect(
      ids(await t.store.games.listAttendance((await t.store.games.findByDate(t.group.id, DATE))?.id ?? '')),
    ).toEqual([A]);
  });

  it('GRP-32: jogo em andamento num grupo arquivado → o jogo atual também dá GROUP_ARCHIVED', async () => {
    const t = await setup({ members: [A] });
    await t.confirmInOrder(A);
    t.clock.now = FRIDAY_20H;
    await t.groups.archive(OWNER, t.group.id);
    await expectAppError(t.games.current(A, t.group.id), 'GROUP_ARCHIVED', 409);
  });

  it('GRP-32: o dono muda as camadas, troca um link, remove alguém ou cancela o jogo → GROUP_ARCHIVED e nada muda', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    await t.groups.archive(OWNER, t.group.id);
    const before = t.store.storedGroup(t.group.id);
    await expectAppError(
      t.groups.update(OWNER, t.group.id, { guestsOpenHoursBefore: 6 }),
      'GROUP_ARCHIVED',
      409,
    );
    for (const kind of KINDS)
      await expectAppError(t.groups.rotateInvite(OWNER, t.group.id, kind), 'GROUP_ARCHIVED', 409);
    await expectAppError(t.groups.removeMember(OWNER, t.group.id, A), 'GROUP_ARCHIVED', 409);
    await expectAppError(t.games.cancel(OWNER, t.group.id, DATE), 'GROUP_ARCHIVED', 409);
    expect(t.store.storedGroup(t.group.id)).toEqual(before);
    expect(ids(await t.groups.members(OWNER, t.group.id))).toEqual([OWNER, A, R]);
    expect(t.store.removeCalls).toEqual([]);
  });

  it('GRP-32: ação de dono por quem não é dono num grupo arquivado → GROUP_NOT_OWNER (GRP-04 vem antes)', async () => {
    const t = await setup({ members: [A] });
    await t.groups.archive(OWNER, t.group.id);
    await expectAppError(
      t.groups.update(A, t.group.id, { guestsOpenHoursBefore: 6 }),
      'GROUP_NOT_OWNER',
      403,
    );
    await expectAppError(t.games.cancel(A, t.group.id, DATE), 'GROUP_NOT_OWNER', 403);
  });

  it('GRP-32: confirmar no mesmo instante do arquivamento → GROUP_ARCHIVED e a presença não é gravada', async () => {
    const t = await setup({ members: [A, B] });
    await t.confirmInOrder(A);
    t.store.hooks.beforeAddAttendance.push((_a, groupId) =>
      t.store.forceArchive(groupId, t.clock.now.toISOString()),
    );
    await expectAppError(t.games.confirm(B, t.group.id, DATE), 'GROUP_ARCHIVED', 409);
    const game = await t.store.games.findByDate(t.group.id, DATE, { consistent: true });
    expect(ids(await t.store.games.listAttendance(game?.id ?? ''))).toEqual([A]);
    expect(await t.store.games.getAttendance(game?.id ?? '', B)).toBeUndefined();
  });

  it('GRP-32: confirmar no jogo virtual no mesmo instante do arquivamento → GROUP_ARCHIVED e ninguém gravado', async () => {
    const t = await setup({ members: [A] });
    t.store.hooks.beforeAddAttendance.push((_a, groupId) =>
      t.store.forceArchive(groupId, t.clock.now.toISOString()),
    );
    await expectAppError(t.games.confirm(A, t.group.id, DATE), 'GROUP_ARCHIVED', 409);
    const game = await t.store.games.findByDate(t.group.id, DATE, { consistent: true });
    expect(await t.store.games.listAttendance(game?.id ?? '')).toEqual([]);
  });

  it('GRP-32: convidado confirma pelo link no mesmo instante do arquivamento → GROUP_ARCHIVED e não é gravado', async () => {
    const t = await setup({ members: [A], guestsOpenHoursBefore: 6, now: FRIDAY_13H });
    await t.confirmInOrder(A);
    t.store.hooks.beforeAddAttendance.push((_a, groupId) =>
      t.store.forceArchive(groupId, t.clock.now.toISOString()),
    );
    await expectAppError(t.games.guestConfirm(G, guestTokenOf(t.group), DATE), 'GROUP_ARCHIVED', 409);
    const game = await t.store.games.findByDate(t.group.id, DATE, { consistent: true });
    expect(ids(await t.store.games.listAttendance(game?.id ?? ''))).toEqual([A]);
  });

  it('GRP-32: arquivado e cancelado no mesmo instante da confirmação → GROUP_ARCHIVED', async () => {
    const t = await setup({ members: [A, B] });
    await t.confirmInOrder(A);
    t.store.hooks.beforeAddAttendance.push((a, groupId) => {
      t.store.forceCancel(a.gameId, t.clock.now.toISOString());
      t.store.forceArchive(groupId, t.clock.now.toISOString());
    });
    await expectAppError(t.games.confirm(B, t.group.id, DATE), 'GROUP_ARCHIVED', 409);
    const game = await t.store.games.findByDate(t.group.id, DATE, { consistent: true });
    expect(ids(await t.store.games.listAttendance(game?.id ?? ''))).toEqual([A]);
  });

  it('GRP-32: remover no mesmo instante do arquivamento (stale) → GROUP_ARCHIVED, o membro fica e nenhum link é gravado', async () => {
    const t = await setup({ members: [A] });
    t.store.removeScript.push((args) => {
      t.store.forceArchive(args.group.id, t.clock.now.toISOString());
      return 'stale';
    });
    await expectAppError(t.groups.removeMember(OWNER, t.group.id, A), 'GROUP_ARCHIVED', 409);
    expect(t.store.membershipOf(t.group.id, A)).toBeDefined();
    expect(ids(await t.groups.members(OWNER, t.group.id))).toEqual([OWNER, A]);
    const stored = t.store.storedGroup(t.group.id);
    expect(stored?.archivedAt).toBeDefined();
    expect(stored?.inviteToken).toBeUndefined();
    expect(t.store.removeCalls).toHaveLength(1);
  });
});

describe('confirmar no mesmo instante do cancelamento (GRP-24)', () => {
  it('GRP-24: o cancelamento é gravado entre a leitura e a confirmação → GAME_CANCELLED e a presença não é gravada', async () => {
    const t = await setup({ members: [A, B] });
    await t.confirmInOrder(A);
    t.store.hooks.beforeAddAttendance.push((a) => t.store.forceCancel(a.gameId, t.clock.now.toISOString()));
    await expectAppError(t.games.confirm(B, t.group.id, DATE), 'GAME_CANCELLED', 409);
    const game = await t.store.games.findByDate(t.group.id, DATE, { consistent: true });
    expect(ids(await t.store.games.listAttendance(game?.id ?? ''))).toEqual([A]);
    expect(await t.store.games.getAttendance(game?.id ?? '', B)).toBeUndefined();
  });

  it('GRP-24: convidado pelo link no mesmo instante do cancelamento → GAME_CANCELLED e não é gravado', async () => {
    const t = await setup({ members: [A], guestsOpenHoursBefore: 6, now: FRIDAY_13H });
    await t.confirmInOrder(A);
    t.store.hooks.beforeAddAttendance.push((a) => t.store.forceCancel(a.gameId, t.clock.now.toISOString()));
    await expectAppError(t.games.guestConfirm(G, guestTokenOf(t.group), DATE), 'GAME_CANCELLED', 409);
    const game = await t.store.games.findByDate(t.group.id, DATE, { consistent: true });
    expect(ids(await t.store.games.listAttendance(game?.id ?? ''))).toEqual([A]);
  });

  it('GRP-24: quem confirmou antes do cancelamento está na lista e recebe o aviso', async () => {
    const t = await setup({ members: [A, B] });
    await t.confirmInOrder(A, B);
    await t.games.cancel(OWNER, t.group.id, DATE);
    expect(ofType(t.sent, 'game_cancelled').sort()).toEqual([A, B].sort());
  });

  it('GRP-24: confirmar de novo quem já está na lista continua mantendo a posição (exists)', async () => {
    const t = await setup({ members: [A, B] });
    await t.confirmInOrder(A, B);
    const game = await t.games.confirm(A, t.group.id, DATE);
    expect(ids(game.confirmed)).toEqual([A, B]);
  });
});

describe('desarquivar o grupo (GRP-33)', () => {
  it('GRP-33: o dono desarquiva → sem archivedAt e com três links novos, diferentes dos antigos', async () => {
    const t = await setup({ members: [A] });
    const old = tokensOf(t.group);
    await t.groups.archive(OWNER, t.group.id);
    const back = await t.groups.unarchive(OWNER, t.group.id);
    expect(GroupSchema.parse(back)).toEqual(back);
    expect(back.archivedAt).toBeUndefined();
    const fresh = tokensOf(back);
    expect(fresh.member).not.toBe(old.member);
    expect(fresh.reserve).not.toBe(old.reserve);
    expect(fresh.guest).not.toBe(old.guest);
    expect(new Set(Object.values(fresh)).size).toBe(3);
    expect(t.store.storedGroup(t.group.id)?.archivedAt).toBeUndefined();
  });

  it('GRP-33: os links antigos não voltam a valer e os novos funcionam', async () => {
    const t = await setup({ guestsOpenHoursBefore: 6 });
    const old = tokensOf(t.group);
    await t.groups.archive(OWNER, t.group.id);
    const fresh = tokensOf(await t.groups.unarchive(OWNER, t.group.id));
    await expectAppError(t.groups.acceptInvite(A, old.member), 'GROUP_INVITE_INVALID', 404);
    await expectAppError(t.groups.acceptInvite(R, old.reserve), 'GROUP_INVITE_INVALID', 404);
    await expectAppError(t.games.guestView(G, old.guest), 'GAME_LINK_INVALID', 404);
    expect((await t.groups.acceptInvite(A, fresh.member)).id).toBe(t.group.id);
    expect((await t.groups.acceptInvite(R, fresh.reserve)).id).toBe(t.group.id);
    expect((await t.games.guestView(G, fresh.guest)).group.id).toBe(t.group.id);
  });

  it('GRP-33: o grupo volta para "meus grupos" de todos e sai dos arquivados', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    await t.groups.archive(OWNER, t.group.id);
    await t.groups.unarchive(OWNER, t.group.id);
    for (const who of [OWNER, A, R]) {
      expect((await t.groups.myGroups(who)).map((g) => g.id)).toEqual([t.group.id]);
      expect(await t.groups.archivedGroups(who)).toEqual([]);
    }
  });

  it('GRP-33: depois de desarquivar, o grupo volta a aceitar escrita (jogo atual e confirmar)', async () => {
    const t = await setup({ members: [A] });
    await t.groups.archive(OWNER, t.group.id);
    await t.groups.unarchive(OWNER, t.group.id);
    expect((await t.games.current(A, t.group.id)).date).toBe(DATE);
    const game = await t.games.confirm(A, t.group.id, DATE);
    expect(ids(game.confirmed)).toEqual([A]);
  });

  it('GRP-33: membro ou reserva tenta desarquivar → GROUP_NOT_OWNER; quem não participa → GROUP_NOT_FOUND', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    await t.groups.archive(OWNER, t.group.id);
    await expectAppError(t.groups.unarchive(A, t.group.id), 'GROUP_NOT_OWNER', 403);
    await expectAppError(t.groups.unarchive(R, t.group.id), 'GROUP_NOT_OWNER', 403);
    await expectAppError(t.groups.unarchive(OUTSIDER, t.group.id), 'GROUP_NOT_FOUND', 404);
    expect(t.store.unarchiveCalls).toEqual([]);
    expect(t.store.storedGroup(t.group.id)?.archivedAt).toBeDefined();
  });

  it('GRP-33: desarquivar um grupo ativo não muda nada (mesmos links, sem chamar o repositório)', async () => {
    const t = await setup({ members: [A] });
    const before = tokensOf(t.group);
    const same = await t.groups.unarchive(OWNER, t.group.id);
    expect(same.archivedAt).toBeUndefined();
    expect(tokensOf(same)).toEqual(before);
    expect(t.store.unarchiveCalls).toEqual([]);
    expect((await t.groups.acceptInvite(B, before.member)).id).toBe(t.group.id);
  });

  it('GRP-33: outra requisição desarquivou antes (not_archived) → relê e devolve o grupo atual', async () => {
    const t = await setup({ members: [A] });
    await t.groups.archive(OWNER, t.group.id);
    const winner = {
      inviteToken: 'winner-member',
      reserveInviteToken: 'winner-reserve',
      guestToken: 'winner-guest',
    };
    t.store.unarchiveScript.push(({ group }) => {
      t.store.naturalUnarchive({ group, tokens: winner });
      return 'not_archived';
    });
    const back = await t.groups.unarchive(OWNER, t.group.id);
    expect(back.archivedAt).toBeUndefined();
    expect(back).toMatchObject(winner);
    expect(t.store.unarchiveCalls).toHaveLength(1);
  });
});

describe('grupos: logo e capa visíveis (GRP-36)', () => {
  const LOGO_URL = 'https://uploads.test/public/group/g/group.logo/l.webp';
  const COVER_URL = 'https://uploads.test/public/group/g/group.cover/c.webp';

  /** Grupo com logo e capa já ligados (como a transação da mídia grava, MID-08). */
  async function withImages() {
    const t = await setup({ members: [A], reserves: [R], guestsOpenHoursBefore: 6 });
    await t.store.groups.update(t.group.id, {
      logoMediaId: randomUUID(),
      logoUrl: LOGO_URL,
      coverMediaId: randomUUID(),
      coverUrl: COVER_URL,
    } as unknown as GroupPatch);
    return t;
  }

  it('GRP-36: membro e reserva veem `logoUrl` e `coverUrl` no grupo, sem os ids das mídias', async () => {
    const t = await withImages();
    for (const who of [OWNER, A, R]) {
      const seen = await t.groups.get(who, t.group.id);
      expect(seen).toMatchObject({ logoUrl: LOGO_URL, coverUrl: COVER_URL });
      expect(seen).not.toHaveProperty('logoMediaId');
      expect(seen).not.toHaveProperty('coverMediaId');
    }
  });

  it('GRP-36: o card de "meus grupos" traz o logo e a capa', async () => {
    const t = await withImages();
    const [mine] = await t.groups.myGroups(A);
    expect(MyGroupSchema.parse(mine)).toMatchObject({ logoUrl: LOGO_URL, coverUrl: COVER_URL });
    expect(mine).not.toHaveProperty('logoMediaId');
    expect(mine).not.toHaveProperty('coverMediaId');
  });

  it('GRP-36: o convidado pelo link do jogo vê o logo e a capa', async () => {
    const t = await withImages();
    const view = await t.games.guestView(G, guestTokenOf(t.group));
    expect(GuestGameSchema.parse(view).group).toMatchObject({ logoUrl: LOGO_URL, coverUrl: COVER_URL });
    expect(view.group).not.toHaveProperty('logoMediaId');
    expect(view.group).not.toHaveProperty('coverMediaId');
  });
});

describe('reabrir o jogo cancelado (GRP-44)', () => {
  /** Vagas 2: A e B dentro, C na fila; o dono também confirmou. Depois, o dono cancela. */
  async function cancelledWithList() {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    await t.games.cancel(OWNER, t.group.id, DATE);
    t.sent.splice(0);
    return t;
  }

  it('GRP-44: o dono reabre → o jogo volta a open com a mesma lista, dentro e fila na mesma ordem', async () => {
    const t = await cancelledWithList();
    const game = await t.games.reopen(OWNER, t.group.id, DATE);
    expect(GameSchema.parse(game)).toBeTruthy();
    expect(game.status).toBe('open');
    expect(ids(game.confirmed)).toEqual([A, B]);
    expect(ids(game.waitlist)).toEqual([C]);
    const seen = await t.games.current(A, t.group.id);
    expect(seen.status).toBe('open');
    expect(ids(seen.confirmed)).toEqual([A, B]);
    expect(ids(seen.waitlist)).toEqual([C]);
  });

  it('GRP-44: todos da lista (dentro e fila) recebem game_reopened com o link do grupo; o dono não', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(OWNER, A, B, C);
    await t.games.cancel(OWNER, t.group.id, DATE);
    t.sent.splice(0);
    await t.games.reopen(OWNER, t.group.id, DATE);
    expect(ofType(t.sent, 'game_reopened').sort()).toEqual([A, B, C].sort());
    expect(t.sent).toHaveLength(3);
    for (const n of t.sent) {
      expect(n).toMatchObject({
        type: 'game_reopened',
        title: 'Jogo reaberto',
        link: `/groups/${t.group.id}`,
      });
      expect(n.body).toContain('voltou a valer');
    }
  });

  it('GRP-44: depois de reabrir, confirmar e desistir voltam a valer (quem confirma vai para o fim)', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(A, B);
    await t.games.cancel(OWNER, t.group.id, DATE);
    t.tick();
    await t.games.reopen(OWNER, t.group.id, DATE);
    t.tick();
    const game = await t.games.confirm(C, t.group.id, DATE);
    expect(ids(game.confirmed)).toEqual([A, B]);
    expect(ids(game.waitlist)).toEqual([C]);
    await t.games.leave(A, t.group.id, DATE);
    expect(ofType(t.sent, 'waitlist_promoted')).toEqual([C]);
  });

  it('GRP-44: reabrir um jogo que não está cancelado → devolve o jogo como está e ninguém é avisado', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    const before = await t.games.current(OWNER, t.group.id);
    const game = await t.games.reopen(OWNER, t.group.id, DATE);
    expect(game).toEqual(before);
    expect(t.sent).toEqual([]);
  });

  it('GRP-44: reabrir o jogo virtual (ninguém confirmou) → devolve o jogo open, sem criar item nem avisar', async () => {
    const t = await setup({ members: [A] });
    const game = await t.games.reopen(OWNER, t.group.id, DATE);
    expect(game.status).toBe('open');
    expect(game.confirmed).toEqual([]);
    expect(t.store.gameCount()).toBe(0);
    expect(t.sent).toEqual([]);
  });

  it('GRP-44: reabrir duas vezes → a segunda devolve o jogo e não avisa outra vez', async () => {
    const t = await cancelledWithList();
    const first = await t.games.reopen(OWNER, t.group.id, DATE);
    const second = await t.games.reopen(OWNER, t.group.id, DATE);
    expect(second).toEqual(first);
    expect(ofType(t.sent, 'game_reopened').sort()).toEqual([A, B, C].sort());
  });

  it('GRP-44: outra reabertura gravada no mesmo instante (not_cancelled) → devolve o jogo open sem avisar', async () => {
    const t = await cancelledWithList();
    t.store.hooks.beforeReopen.push((gameId) => t.store.forceReopen(gameId));
    const game = await t.games.reopen(OWNER, t.group.id, DATE);
    expect(game.status).toBe('open');
    expect(ids(game.confirmed)).toEqual([A, B]);
    expect(ids(game.waitlist)).toEqual([C]);
    expect(t.sent).toEqual([]);
  });

  it('GRP-44: com o jogo já no horário de início → GAME_CLOSED, continua cancelado e ninguém é avisado', async () => {
    const t = await cancelledWithList();
    t.clock.now = FRIDAY_20H;
    await expectAppError(t.games.reopen(OWNER, t.group.id, DATE), 'GAME_CLOSED', 409);
    expect((await t.games.current(A, t.group.id)).status).toBe('cancelled');
    expect(t.store.reopenCalls).toEqual([]);
    expect(t.sent).toEqual([]);
  });

  it('GRP-44: membro ou reserva tenta reabrir → GROUP_NOT_OWNER; quem não participa → GROUP_NOT_FOUND; nada muda', async () => {
    const t = await setup({ members: [A], reserves: [R], now: THURSDAY_19H });
    await t.confirmInOrder(A, R);
    await t.games.cancel(OWNER, t.group.id, DATE);
    t.sent.splice(0);
    await expectAppError(t.games.reopen(A, t.group.id, DATE), 'GROUP_NOT_OWNER', 403);
    await expectAppError(t.games.reopen(R, t.group.id, DATE), 'GROUP_NOT_OWNER', 403);
    await expectAppError(t.games.reopen(OUTSIDER, t.group.id, DATE), 'GROUP_NOT_FOUND', 404);
    expect((await t.games.current(A, t.group.id)).status).toBe('cancelled');
    expect(t.sent).toEqual([]);
  });

  it('GRP-44: data diferente do jogo atual → GAME_NOT_FOUND', async () => {
    const t = await cancelledWithList();
    await expectAppError(t.games.reopen(OWNER, t.group.id, NEXT_DATE), 'GAME_NOT_FOUND', 404);
    expect((await t.games.current(A, t.group.id)).status).toBe('cancelled');
  });

  it('GRP-44: grupo arquivado → GROUP_ARCHIVED (409), o jogo continua cancelado e ninguém é avisado', async () => {
    const t = await setup({ slots: 2, members: [A, B] });
    await t.confirmInOrder(A, B);
    await t.groups.archive(OWNER, t.group.id);
    t.sent.splice(0);
    await expectAppError(t.games.reopen(OWNER, t.group.id, DATE), 'GROUP_ARCHIVED', 409);
    expect(t.sent).toEqual([]);
    await t.groups.unarchive(OWNER, t.group.id);
    expect((await t.games.current(A, t.group.id)).status).toBe('cancelled');
  });

  it('GRP-44: depois de desarquivar, o dono reabre o jogo cancelado pelo arquivamento e a lista volta', async () => {
    const t = await setup({ slots: 2, members: [A, B] });
    await t.confirmInOrder(A, B);
    await t.groups.archive(OWNER, t.group.id);
    await t.groups.unarchive(OWNER, t.group.id);
    t.sent.splice(0);
    const game = await t.games.reopen(OWNER, t.group.id, DATE);
    expect(game.status).toBe('open');
    expect(ids(game.confirmed)).toEqual([A, B]);
    expect(ofType(t.sent, 'game_reopened').sort()).toEqual([A, B].sort());
  });

  it('GRP-44: arquivamento no mesmo instante da reabertura → GROUP_ARCHIVED, nada é gravado e ninguém é avisado', async () => {
    const t = await cancelledWithList();
    t.store.hooks.beforeReopen.push((_gameId, groupId) =>
      t.store.forceArchive(groupId, t.clock.now.toISOString()),
    );
    await expectAppError(t.games.reopen(OWNER, t.group.id, DATE), 'GROUP_ARCHIVED', 409);
    expect(t.store.reopenCalls).toHaveLength(1);
    expect((await t.store.games.findByDate(t.group.id, DATE))?.cancelledAt).toBeDefined();
    expect(t.sent).toEqual([]);
  });

  it('GRP-44: a reabertura vem antes do arquivamento → o arquivamento cancela de novo, com o aviso (GRP-31)', async () => {
    const t = await cancelledWithList();
    await t.games.reopen(OWNER, t.group.id, DATE);
    t.sent.splice(0);
    await t.groups.archive(OWNER, t.group.id);
    expect(ofType(t.sent, 'game_cancelled').sort()).toEqual([A, B, C].sort());
  });

  it('GRP-44: cancelar de novo depois de reabrir avisa outra vez, com a data do novo cancelamento (GRP-24)', async () => {
    const t = await cancelledWithList();
    const firstAt = (await t.store.games.findByDate(t.group.id, DATE))?.cancelledAt;
    t.tick();
    await t.games.reopen(OWNER, t.group.id, DATE);
    t.tick();
    t.sent.splice(0);
    const game = await t.games.cancel(OWNER, t.group.id, DATE);
    expect(game.status).toBe('cancelled');
    expect(ofType(t.sent, 'game_cancelled').sort()).toEqual([A, B, C].sort());
    const secondAt = (await t.store.games.findByDate(t.group.id, DATE))?.cancelledAt;
    expect(secondAt).toBe(t.clock.now.toISOString());
    expect(secondAt).not.toBe(firstAt);
  });
});

describe('remover com o jogo cancelado (GRP-25)', () => {
  it('GRP-25: jogo cancelado, o dono remove quem estava dentro → a presença sai e ninguém é avisado de promoção', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    await t.games.cancel(OWNER, t.group.id, DATE);
    t.sent.splice(0);
    await t.groups.removeMember(OWNER, t.group.id, A);
    expect(t.store.removeCalls[0]?.attendance).toMatchObject({ userId: A });
    expect(
      await t.store.games.getAttendance((await t.store.games.findByDate(t.group.id, DATE))?.id ?? '', A),
    ).toBe(undefined);
    const game = await t.games.current(OWNER, t.group.id);
    expect(game.status).toBe('cancelled');
    expect(ids(game.confirmed)).toEqual([B, C]);
    expect(ofType(t.sent, 'waitlist_promoted')).toEqual([]);
    expect(t.sent).toEqual([]);
  });

  it('GRP-25: removido durante o cancelamento não volta para a lista ao reabrir (e não recebe game_reopened)', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    await t.games.cancel(OWNER, t.group.id, DATE);
    await t.groups.removeMember(OWNER, t.group.id, A);
    t.sent.splice(0);
    const game = await t.games.reopen(OWNER, t.group.id, DATE);
    expect(ids(game.confirmed)).toEqual([B, C]);
    expect(game.waitlist).toEqual([]);
    expect(ofType(t.sent, 'game_reopened').sort()).toEqual([B, C].sort());
    expect(ofType(t.sent, 'waitlist_promoted')).toEqual([]);
  });

  it('GRP-25: jogo cancelado, remover uma reserva que estava na lista → a presença sai, sem aviso', async () => {
    const t = await setup({ slots: 2, members: [A], reserves: [R], now: THURSDAY_19H });
    await t.confirmInOrder(A, R);
    await t.games.cancel(OWNER, t.group.id, DATE);
    t.sent.splice(0);
    await t.groups.removeMember(OWNER, t.group.id, R);
    expect(ids((await t.games.current(OWNER, t.group.id)).confirmed)).toEqual([A]);
    expect(t.sent).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Limites de membros e reservas, convite para membro e sair do grupo (GRP-38–42). Relógio: quinta 10h.
const roleOfIn = (list: { userId: string; role: MemberRole }[], id: string) =>
  list.find((m) => m.userId === id)?.role;
const inviteOfIn = (list: { userId: string; memberInviteExpiresAt?: string | undefined }[], id: string) =>
  list.find((m) => m.userId === id)?.memberInviteExpiresAt;
const IN_7_DAYS = iso(new Date(THURSDAY_10H.getTime() + 7 * DAY));

describe('limites do grupo (GRP-38, GRP-16)', () => {
  it('GRP-38: grupo novo nasce com 30 membros e 30 reservas, decididos pela api', async () => {
    const s = setupServices();
    const group = await s.groups.create(OWNER, INPUT);
    expect(group).toMatchObject({ maxMembers: 30, maxReserves: 30 });
    expect(await s.groups.get(OWNER, group.id)).toMatchObject({ maxMembers: 30, maxReserves: 30 });
  });

  it('GRP-38: membros de 2 a 30 e reservas de 0 a 30 no PATCH; fora disso o contrato recusa', () => {
    for (const ok of [{ maxMembers: 2 }, { maxMembers: 30 }, { maxReserves: 0 }, { maxReserves: 30 }])
      expect(UpdateGroupInputSchema.safeParse(ok).success).toBe(true);
    for (const bad of [{ maxMembers: 1 }, { maxMembers: 31 }, { maxReserves: -1 }, { maxReserves: 31 }])
      expect(UpdateGroupInputSchema.safeParse(bad).success).toBe(false);
  });

  it('GRP-16: o PATCH aceita os dois limites, e nome, horário e vagas continuam fora', () => {
    expect(
      UpdateGroupInputSchema.parse({
        maxMembers: 14,
        maxReserves: 5,
        name: 'Outro',
        time: '20:00',
        slots: 20,
      }),
    ).toEqual({ maxMembers: 14, maxReserves: 5 });
  });

  it('GRP-16: o dono muda os limites → o grupo devolve os novos para todos', async () => {
    const t = await setup({ members: [A] });
    const updated = await t.groups.update(OWNER, t.group.id, { maxMembers: 14, maxReserves: 0 });
    expect(updated).toMatchObject({ maxMembers: 14, maxReserves: 0 });
    expect(await t.groups.get(A, t.group.id)).toMatchObject({ maxMembers: 14, maxReserves: 0 });
  });

  it('GRP-16: quem não é dono muda os limites → GROUP_NOT_OWNER e nada muda', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    for (const who of [A, R])
      await expectAppError(t.groups.update(who, t.group.id, { maxMembers: 5 }), 'GROUP_NOT_OWNER', 403);
    expect(t.store.storedGroup(t.group.id)?.maxMembers).toBe(30);
  });

  it('GRP-38: abaixar o limite para menos do que o grupo tem não tira ninguém, só barra novas entradas', async () => {
    const t = await setup({ members: [A, B, C], reserves: [R] });
    await t.groups.update(OWNER, t.group.id, { maxMembers: 2, maxReserves: 0 });
    const list = await t.groups.members(OWNER, t.group.id);
    expect(ids(list).sort()).toEqual([OWNER, A, B, C, R].sort());
    expect(roleOfIn(list, R)).toBe('reserve');
    await expectAppError(t.groups.acceptInvite(D, tokenOf(t.group)), 'GROUP_MEMBERS_FULL', 409);
    await expectAppError(t.groups.acceptInvite(D, reserveTokenOf(t.group)), 'GROUP_RESERVES_FULL', 409);
    await t.groups.removeMember(OWNER, t.group.id, A);
    // 3 membros (dono, B, C) ainda passam do limite de 2.
    const fresh = await t.groups.get(OWNER, t.group.id);
    await expectAppError(t.groups.acceptInvite(D, tokenOf(fresh)), 'GROUP_MEMBERS_FULL', 409);
  });

  it('GRP-38: com 0 reservas o grupo não aceita reservas', async () => {
    const t = await setup({ maxReserves: 0 });
    await expectAppError(t.groups.acceptInvite(R, reserveTokenOf(t.group)), 'GROUP_RESERVES_FULL', 409);
    await expectAppError(t.groups.get(R, t.group.id), 'GROUP_NOT_FOUND', 404);
  });
});

describe('entrar pelo link com limite (GRP-02, GRP-39)', () => {
  it('GRP-02: membros no limite (o dono conta) → o link de membro dá GROUP_MEMBERS_FULL e a pessoa não entra', async () => {
    const t = await setup({ maxMembers: 3, members: [A, B] });
    await expectAppError(t.groups.acceptInvite(C, tokenOf(t.group)), 'GROUP_MEMBERS_FULL', 409);
    await expectAppError(t.groups.get(C, t.group.id), 'GROUP_NOT_FOUND', 404);
    expect(t.store.countOf(t.group.id, 'member')).toBe(3);
  });

  it('GRP-02: membros no limite → a reserva que abre o link de membro continua reserva', async () => {
    const t = await setup({ maxMembers: 2, members: [A], reserves: [R] });
    await expectAppError(t.groups.acceptInvite(R, tokenOf(t.group)), 'GROUP_MEMBERS_FULL', 409);
    expect(roleOfIn(await t.groups.members(OWNER, t.group.id), R)).toBe('reserve');
    expect(t.store.membershipOf(t.group.id, R)?.roleChangedAt).toBeUndefined();
  });

  it('GRP-02: reservas no limite → o link de reserva dá GROUP_RESERVES_FULL', async () => {
    const t = await setup({ maxReserves: 1, reserves: [R] });
    await expectAppError(t.groups.acceptInvite(D, reserveTokenOf(t.group)), 'GROUP_RESERVES_FULL', 409);
    await expectAppError(t.groups.get(D, t.group.id), 'GROUP_NOT_FOUND', 404);
  });

  it('GRP-02: com os limites cheios, membro abrindo o link de reserva e quem entra de novo não mudam nada nem dão erro', async () => {
    const t = await setup({ maxMembers: 2, maxReserves: 1, members: [A], reserves: [R] });
    expect((await t.groups.acceptInvite(A, reserveTokenOf(t.group))).myRole).toBe('member');
    expect((await t.groups.acceptInvite(A, tokenOf(t.group))).myRole).toBe('member');
    expect((await t.groups.acceptInvite(R, reserveTokenOf(t.group))).myRole).toBe('reserve');
    expect(t.store.countOf(t.group.id, 'member')).toBe(2);
    expect(t.store.countOf(t.group.id, 'reserve')).toBe(1);
  });

  it('GRP-39: a reserva que vira membro pelo link ocupa um lugar de membro e libera um de reserva', async () => {
    const t = await setup({ maxMembers: 3, maxReserves: 1, members: [A], reserves: [R] });
    expect((await t.groups.acceptInvite(R, tokenOf(t.group))).myRole).toBe('member');
    expect(t.store.countOf(t.group.id, 'member')).toBe(3);
    expect(t.store.countOf(t.group.id, 'reserve')).toBe(0);
    expect((await t.groups.acceptInvite(D, reserveTokenOf(t.group))).myRole).toBe('reserve');
    await expectAppError(t.groups.acceptInvite(C, tokenOf(t.group)), 'GROUP_MEMBERS_FULL', 409);
  });

  it('GRP-39: duas entradas ao mesmo tempo no último lugar → só uma passa, a outra recebe GROUP_MEMBERS_FULL', async () => {
    const t = await setup({ maxMembers: 2 });
    const results = await Promise.allSettled([
      t.groups.acceptInvite(A, tokenOf(t.group)),
      t.groups.acceptInvite(B, tokenOf(t.group)),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.flatMap((r) => (r.status === 'rejected' ? [r.reason] : []));
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toBeInstanceOf(AppError);
    expect(rejected[0]).toMatchObject({ code: 'GROUP_MEMBERS_FULL', status: 409 });
    expect(t.store.countOf(t.group.id, 'member')).toBe(2);
  });

  it('GRP-39: o limite é conferido na gravação: outra entrada gravada depois da leitura → GROUP_MEMBERS_FULL', async () => {
    const t = await setup({ maxMembers: 3, members: [A] });
    t.store.hooks.beforeAddMember.push((groupId) => {
      t.store.insert(groupId, B, 'member');
    });
    await expectAppError(t.groups.acceptInvite(C, tokenOf(t.group)), 'GROUP_MEMBERS_FULL', 409);
    expect(ids(await t.groups.members(OWNER, t.group.id)).sort()).toEqual([OWNER, A, B].sort());
  });

  it('GRP-39: reservas também: outra reserva gravada depois da leitura → GROUP_RESERVES_FULL', async () => {
    const t = await setup({ maxReserves: 1 });
    t.store.hooks.beforeAddMember.push((groupId) => {
      t.store.insert(groupId, R, 'reserve');
    });
    await expectAppError(t.groups.acceptInvite(D, reserveTokenOf(t.group)), 'GROUP_RESERVES_FULL', 409);
    expect(t.store.countOf(t.group.id, 'reserve')).toBe(1);
  });

  it('GRP-39: o dono abaixa o limite no meio (stale) → relê o grupo, tenta de novo e responde GROUP_MEMBERS_FULL', async () => {
    const t = await setup({ maxMembers: 3, members: [A] });
    t.store.hooks.beforeAddMember.push((groupId) => t.store.forceLimit(groupId, 'member', 2));
    await expectAppError(t.groups.acceptInvite(C, tokenOf(t.group)), 'GROUP_MEMBERS_FULL', 409);
    await expectAppError(t.groups.get(C, t.group.id), 'GROUP_NOT_FOUND', 404);
  });

  it('GRP-39: o dono sobe o limite no meio (stale) → relê e entra com o limite novo', async () => {
    const t = await setup({ maxMembers: 3, members: [A] });
    t.store.hooks.beforeAddMember.push((groupId) => t.store.forceLimit(groupId, 'member', 10));
    expect((await t.groups.acceptInvite(C, tokenOf(t.group))).myRole).toBe('member');
    expect(t.store.addCalls.filter((c) => c.userId === C)).toHaveLength(2);
  });

  it('GRP-39: grupo arquivado no meio da entrada (stale) → o link deixou de valer (GRP-31) e ninguém entra', async () => {
    const t = await setup({ members: [A] });
    t.store.hooks.beforeAddMember.push((groupId) =>
      t.store.forceArchive(groupId, THURSDAY_10H.toISOString()),
    );
    await expectAppError(t.groups.acceptInvite(C, tokenOf(t.group)), 'GROUP_INVITE_INVALID', 404);
    expect(t.store.membershipOf(t.group.id, C)).toBeUndefined();
  });
});

describe('remover libera o lugar e apaga o convite (GRP-25)', () => {
  it('GRP-25: remover um membro libera o lugar no limite → outra pessoa entra pelo link novo', async () => {
    const t = await setup({ maxMembers: 2, members: [A] });
    await t.groups.removeMember(OWNER, t.group.id, A);
    expect(t.store.countOf(t.group.id, 'member')).toBe(1);
    const fresh = await t.groups.get(OWNER, t.group.id);
    expect((await t.groups.acceptInvite(B, tokenOf(fresh))).myRole).toBe('member');
  });

  it('GRP-25: remover uma reserva libera o lugar de reserva', async () => {
    const t = await setup({ maxReserves: 1, reserves: [R] });
    await t.groups.removeMember(OWNER, t.group.id, R);
    const fresh = await t.groups.get(OWNER, t.group.id);
    expect((await t.groups.acceptInvite(D, reserveTokenOf(fresh))).myRole).toBe('reserve');
  });

  it('GRP-25: a reserva removida perde o convite para membro pendente', async () => {
    const t = await setup({ reserves: [R] });
    await t.groups.inviteToMember(OWNER, t.group.id, R);
    await t.groups.removeMember(OWNER, t.group.id, R);
    expect(t.store.removeCalls[0]?.newToken).toBeTypeOf('string');
    const fresh = await t.groups.get(OWNER, t.group.id);
    await t.groups.acceptInvite(R, reserveTokenOf(fresh));
    expect((await t.groups.get(R, t.group.id)).myMemberInvite).toBeUndefined();
    expect(inviteOfIn(await t.groups.members(OWNER, t.group.id), R)).toBeUndefined();
    await expectAppError(t.groups.acceptMemberInvite(R, t.group.id), 'GROUP_MEMBER_INVITE_INVALID', 404);
  });
});

describe('convite para membro (GRP-40)', () => {
  it('GRP-40: o dono convida a reserva → convite de 7 dias e aviso member_invite com o link do grupo', async () => {
    const t = await setup({ reserves: [R] });
    const invite = await t.groups.inviteToMember(OWNER, t.group.id, R);
    expect(MemberInviteSchema.parse(invite)).toEqual(invite);
    expect(invite).toEqual({ userId: R, expiresAt: IN_7_DAYS });
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]).toMatchObject({
      userId: R,
      type: 'member_invite',
      title: 'Convite para ser membro',
      link: `/groups/${t.group.id}`,
    });
    expect(t.sent[0]?.body).toContain(t.group.name);
  });

  it('GRP-40: a reserva vê o convite no grupo, e só o dono vê o prazo na lista de membros', async () => {
    const t = await setup({ members: [A], reserves: [R, D] });
    await t.groups.inviteToMember(OWNER, t.group.id, R);
    expect((await t.groups.get(R, t.group.id)).myMemberInvite).toEqual({ expiresAt: IN_7_DAYS });
    expect((await t.groups.get(D, t.group.id)).myMemberInvite).toBeUndefined();
    expect((await t.groups.get(A, t.group.id)).myMemberInvite).toBeUndefined();
    expect((await t.groups.get(OWNER, t.group.id)).myMemberInvite).toBeUndefined();
    expect(inviteOfIn(await t.groups.members(OWNER, t.group.id), R)).toBe(IN_7_DAYS);
    expect(inviteOfIn(await t.groups.members(OWNER, t.group.id), D)).toBeUndefined();
    for (const who of [A, R, D])
      for (const m of await t.groups.members(who, t.group.id))
        expect(m.memberInviteExpiresAt).toBeUndefined();
  });

  it('GRP-40: convidar de novo com o convite pendente devolve o mesmo, sem avisar outra vez', async () => {
    const t = await setup({ reserves: [R] });
    const first = await t.groups.inviteToMember(OWNER, t.group.id, R);
    t.clock.now = new Date(THURSDAY_10H.getTime() + 2 * DAY);
    const again = await t.groups.inviteToMember(OWNER, t.group.id, R);
    expect(again).toEqual(first);
    expect(ofType(t.sent, 'member_invite')).toEqual([R]);
  });

  it('GRP-40: convite vencido conta como inexistente, e o dono pode convidar de novo (novo prazo e novo aviso)', async () => {
    const t = await setup({ reserves: [R] });
    await t.groups.inviteToMember(OWNER, t.group.id, R);
    const later = new Date(THURSDAY_10H.getTime() + 7 * DAY + MINUTE);
    t.clock.now = later;
    expect((await t.groups.get(R, t.group.id)).myMemberInvite).toBeUndefined();
    expect(inviteOfIn(await t.groups.members(OWNER, t.group.id), R)).toBeUndefined();
    const again = await t.groups.inviteToMember(OWNER, t.group.id, R);
    expect(again.expiresAt).toBe(iso(new Date(later.getTime() + 7 * DAY)));
    expect(ofType(t.sent, 'member_invite')).toEqual([R, R]);
  });

  it('GRP-40: com os membros no limite, convidar responde GROUP_MEMBERS_FULL e ninguém é avisado', async () => {
    const t = await setup({ maxMembers: 2, members: [A], reserves: [R] });
    await expectAppError(t.groups.inviteToMember(OWNER, t.group.id, R), 'GROUP_MEMBERS_FULL', 409);
    expect(t.store.membershipOf(t.group.id, R)?.memberInviteExpiresAt).toBeUndefined();
    expect(t.sent).toEqual([]);
  });

  it('GRP-40: convidar quem não é reserva (membro, dono ou quem não participa) → GROUP_MEMBER_NOT_FOUND', async () => {
    const t = await setup({ members: [A] });
    for (const who of [A, OWNER, OUTSIDER])
      await expectAppError(t.groups.inviteToMember(OWNER, t.group.id, who), 'GROUP_MEMBER_NOT_FOUND', 404);
    expect(t.sent).toEqual([]);
  });

  it('GRP-40: a reserva vira membro entre a leitura e a gravação (not_reserve) → GROUP_MEMBER_NOT_FOUND, sem aviso', async () => {
    const t = await setup({ reserves: [R] });
    const original = t.store.groups.setMemberInvite;
    t.store.groups.setMemberInvite = async (groupId, userId, expiresAt) => {
      t.store.promote(groupId, userId);
      return original(groupId, userId, expiresAt);
    };
    await expectAppError(t.groups.inviteToMember(OWNER, t.group.id, R), 'GROUP_MEMBER_NOT_FOUND', 404);
    expect(t.sent).toEqual([]);
  });

  it('GRP-40: só o dono convida e cancela (GROUP_NOT_OWNER); quem não participa recebe GROUP_NOT_FOUND', async () => {
    const t = await setup({ members: [A], reserves: [R, D] });
    await expectAppError(t.groups.inviteToMember(A, t.group.id, R), 'GROUP_NOT_OWNER', 403);
    await expectAppError(t.groups.inviteToMember(D, t.group.id, R), 'GROUP_NOT_OWNER', 403);
    await expectAppError(t.groups.cancelMemberInvite(A, t.group.id, R), 'GROUP_NOT_OWNER', 403);
    await expectAppError(t.groups.inviteToMember(OUTSIDER, t.group.id, R), 'GROUP_NOT_FOUND', 404);
    expect(t.sent).toEqual([]);
  });

  it('GRP-40: o dono cancela o convite pendente → some da lista e da página da reserva', async () => {
    const t = await setup({ reserves: [R] });
    await t.groups.inviteToMember(OWNER, t.group.id, R);
    await expect(t.groups.cancelMemberInvite(OWNER, t.group.id, R)).resolves.toBeUndefined();
    expect(inviteOfIn(await t.groups.members(OWNER, t.group.id), R)).toBeUndefined();
    expect((await t.groups.get(R, t.group.id)).myMemberInvite).toBeUndefined();
    await expectAppError(t.groups.acceptMemberInvite(R, t.group.id), 'GROUP_MEMBER_INVITE_INVALID', 404);
  });

  it('GRP-40: cancelar um convite que não existe não faz nada', async () => {
    const t = await setup({ reserves: [R] });
    await expect(t.groups.cancelMemberInvite(OWNER, t.group.id, R)).resolves.toBeUndefined();
    expect(roleOfIn(await t.groups.members(OWNER, t.group.id), R)).toBe('reserve');
    expect(t.sent).toEqual([]);
  });

  it('GRP-40: o convite não segura o lugar: quem entra antes pelo link de membro fica com ele', async () => {
    const t = await setup({ maxMembers: 3, members: [A], reserves: [R] });
    await t.groups.inviteToMember(OWNER, t.group.id, R);
    expect((await t.groups.acceptInvite(B, tokenOf(t.group))).myRole).toBe('member');
    await expectAppError(t.groups.acceptMemberInvite(R, t.group.id), 'GROUP_MEMBERS_FULL', 409);
  });
});

describe('aceitar ou recusar o convite (GRP-41)', () => {
  it('GRP-41: aceitar faz da reserva membro, com roleChangedAt e a mesma data de entrada (GRP-03)', async () => {
    const t = await setup({ reserves: [R] });
    const joinedAt = t.store.membershipOf(t.group.id, R)?.createdAt;
    await t.groups.inviteToMember(OWNER, t.group.id, R);
    t.clock.now = new Date(THURSDAY_10H.getTime() + DAY);
    const group = await t.groups.acceptMemberInvite(R, t.group.id);
    expect(GroupSchema.parse(group)).toEqual(group);
    expect(group.myRole).toBe('member');
    expect(group.myMemberInvite).toBeUndefined();
    expect(t.store.membershipOf(t.group.id, R)).toMatchObject({
      role: 'member',
      createdAt: joinedAt,
      roleChangedAt: t.clock.now.toISOString(),
    });
    expect(t.store.membershipOf(t.group.id, R)?.memberInviteExpiresAt).toBeUndefined();
    expect(roleOfIn(await t.groups.members(OWNER, t.group.id), R)).toBe('member');
    expect(t.store.countOf(t.group.id, 'member')).toBe(2);
    expect(t.store.countOf(t.group.id, 'reserve')).toBe(0);
  });

  it('GRP-41: aceitar sem lugar → GROUP_MEMBERS_FULL, continua reserva e o convite continua valendo', async () => {
    const t = await setup({ maxMembers: 3, members: [A], reserves: [R] });
    await t.groups.inviteToMember(OWNER, t.group.id, R);
    await t.groups.acceptInvite(B, tokenOf(t.group));
    await expectAppError(t.groups.acceptMemberInvite(R, t.group.id), 'GROUP_MEMBERS_FULL', 409);
    expect(roleOfIn(await t.groups.members(OWNER, t.group.id), R)).toBe('reserve');
    expect((await t.groups.get(R, t.group.id)).myMemberInvite).toEqual({ expiresAt: IN_7_DAYS });
    await t.groups.removeMember(OWNER, t.group.id, B);
    expect((await t.groups.acceptMemberInvite(R, t.group.id)).myRole).toBe('member');
  });

  it('GRP-41: o limite é conferido na gravação do aceite: outra entrada no meio → GROUP_MEMBERS_FULL', async () => {
    const t = await setup({ maxMembers: 3, members: [A], reserves: [R] });
    await t.groups.inviteToMember(OWNER, t.group.id, R);
    t.store.hooks.beforeAddMember.push((groupId) => t.store.insert(groupId, B, 'member'));
    await expectAppError(t.groups.acceptMemberInvite(R, t.group.id), 'GROUP_MEMBERS_FULL', 409);
    expect(roleOfIn(await t.groups.members(OWNER, t.group.id), R)).toBe('reserve');
  });

  it('GRP-41: recusar apaga o convite e o dono não é avisado', async () => {
    const t = await setup({ reserves: [R] });
    await t.groups.inviteToMember(OWNER, t.group.id, R);
    await expect(t.groups.declineMemberInvite(R, t.group.id)).resolves.toBeUndefined();
    expect(inviteOfIn(await t.groups.members(OWNER, t.group.id), R)).toBeUndefined();
    expect((await t.groups.get(R, t.group.id)).myMemberInvite).toBeUndefined();
    expect(roleOfIn(await t.groups.members(OWNER, t.group.id), R)).toBe('reserve');
    expect(t.sent.map((n) => n.type)).toEqual(['member_invite']);
    await expectAppError(t.groups.acceptMemberInvite(R, t.group.id), 'GROUP_MEMBER_INVITE_INVALID', 404);
  });

  it('GRP-41: aceitar ou recusar sem convite pendente → GROUP_MEMBER_INVITE_INVALID', async () => {
    const t = await setup({ members: [A], reserves: [R] });
    for (const who of [R, A]) {
      await expectAppError(t.groups.acceptMemberInvite(who, t.group.id), 'GROUP_MEMBER_INVITE_INVALID', 404);
      await expectAppError(t.groups.declineMemberInvite(who, t.group.id), 'GROUP_MEMBER_INVITE_INVALID', 404);
    }
  });

  it('GRP-41: convite vencido (no prazo exato ou depois) → GROUP_MEMBER_INVITE_INVALID e continua reserva', async () => {
    const t = await setup({ reserves: [R, D] });
    await t.groups.inviteToMember(OWNER, t.group.id, R);
    await t.groups.inviteToMember(OWNER, t.group.id, D);
    t.clock.now = new Date(IN_7_DAYS);
    await expectAppError(t.groups.acceptMemberInvite(R, t.group.id), 'GROUP_MEMBER_INVITE_INVALID', 404);
    t.clock.now = new Date(new Date(IN_7_DAYS).getTime() + MINUTE);
    await expectAppError(t.groups.declineMemberInvite(D, t.group.id), 'GROUP_MEMBER_INVITE_INVALID', 404);
    expect(roleOfIn(await t.groups.members(OWNER, t.group.id), R)).toBe('reserve');
  });

  it('GRP-41: convite já usado → aceitar de novo dá GROUP_MEMBER_INVITE_INVALID', async () => {
    const t = await setup({ reserves: [R] });
    await t.groups.inviteToMember(OWNER, t.group.id, R);
    await t.groups.acceptMemberInvite(R, t.group.id);
    await expectAppError(t.groups.acceptMemberInvite(R, t.group.id), 'GROUP_MEMBER_INVITE_INVALID', 404);
  });

  it('GRP-41: a reserva que vira membro pelo link de membro perde o convite pendente', async () => {
    const t = await setup({ reserves: [R] });
    await t.groups.inviteToMember(OWNER, t.group.id, R);
    expect((await t.groups.acceptInvite(R, tokenOf(t.group))).myRole).toBe('member');
    expect(inviteOfIn(await t.groups.members(OWNER, t.group.id), R)).toBeUndefined();
    expect(t.store.membershipOf(t.group.id, R)?.memberInviteExpiresAt).toBeUndefined();
    await expectAppError(t.groups.acceptMemberInvite(R, t.group.id), 'GROUP_MEMBER_INVITE_INVALID', 404);
  });

  it('GRP-41: quem não participa aceita ou recusa → GROUP_NOT_FOUND (GRP-04)', async () => {
    const t = await setup();
    await expectAppError(t.groups.acceptMemberInvite(OUTSIDER, t.group.id), 'GROUP_NOT_FOUND', 404);
    await expectAppError(t.groups.declineMemberInvite(OUTSIDER, t.group.id), 'GROUP_NOT_FOUND', 404);
  });
});

describe('sair do grupo (GRP-42)', () => {
  it('GRP-42: o membro sai → perde o acesso, o grupo some de "meus grupos" e o link de membro não muda', async () => {
    const t = await setup({ members: [A] });
    const before = t.store.storedGroup(t.group.id);
    await expect(t.groups.leave(A, t.group.id)).resolves.toBeUndefined();
    await expectAppError(t.groups.get(A, t.group.id), 'GROUP_NOT_FOUND', 404);
    expect(await t.groups.myGroups(A)).toEqual([]);
    expect(ids(await t.groups.members(OWNER, t.group.id))).toEqual([OWNER]);
    const after = t.store.storedGroup(t.group.id);
    for (const kind of KINDS) expect(after?.[TOKEN_FIELD[kind]]).toBe(before?.[TOKEN_FIELD[kind]]);
    expect(t.store.removeCalls.at(-1)?.newToken).toBeUndefined();
    expect(t.sent).toEqual([]);
  });

  it('GRP-42: o dono não pode sair → GROUP_OWNER_NOT_REMOVABLE', async () => {
    const t = await setup({ members: [A] });
    await expectAppError(t.groups.leave(OWNER, t.group.id), 'GROUP_OWNER_NOT_REMOVABLE', 409);
    expect(ids(await t.groups.members(OWNER, t.group.id))).toContain(OWNER);
    expect(t.store.removeCalls).toEqual([]);
  });

  it('GRP-42: quem estava dentro do jogo aberto sai → perde a vaga, o 1º da fila sobe e é avisado (GRP-22)', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    await t.groups.leave(A, t.group.id);
    const game = await t.games.current(OWNER, t.group.id);
    expect(ids(game.confirmed)).toEqual([B, C]);
    expect(game.waitlist).toEqual([]);
    expect(ofType(t.sent, 'waitlist_promoted')).toEqual([C]);
    expect(t.sent).toHaveLength(1);
  });

  it('GRP-42: jogo cancelado → a vaga sai e ninguém é avisado de promoção', async () => {
    const t = await setup({ slots: 2, members: [A, B, C] });
    await t.confirmInOrder(A, B, C);
    await t.games.cancel(OWNER, t.group.id, DATE);
    t.sent.splice(0);
    await t.groups.leave(A, t.group.id);
    expect(ids((await t.games.current(OWNER, t.group.id)).confirmed)).toEqual([B, C]);
    expect(t.sent).toEqual([]);
  });

  it('GRP-42: jogo em andamento → a vaga fica', async () => {
    const t = await setup({ slots: 2, members: [A, B] });
    await t.confirmInOrder(A, B);
    t.clock.now = FRIDAY_20H;
    await t.groups.leave(A, t.group.id);
    const game = await t.games.current(OWNER, t.group.id);
    expect(game.status).toBe('in_progress');
    expect(ids(game.confirmed)).toEqual([A, B]);
    expect(t.sent).toEqual([]);
  });

  it('GRP-42: sair libera o lugar no limite do papel, e quem saiu pode voltar pelo mesmo link', async () => {
    const t = await setup({ maxMembers: 2, maxReserves: 1, members: [A], reserves: [R] });
    await t.groups.leave(A, t.group.id);
    await t.groups.leave(R, t.group.id);
    expect(t.store.countOf(t.group.id, 'member')).toBe(1);
    expect(t.store.countOf(t.group.id, 'reserve')).toBe(0);
    expect((await t.groups.acceptInvite(D, reserveTokenOf(t.group))).myRole).toBe('reserve');
    expect((await t.groups.acceptInvite(A, tokenOf(t.group))).myRole).toBe('member');
  });

  it('GRP-42: a reserva que sai perde o convite pendente', async () => {
    const t = await setup({ reserves: [R] });
    await t.groups.inviteToMember(OWNER, t.group.id, R);
    await t.groups.leave(R, t.group.id);
    await t.groups.acceptInvite(R, reserveTokenOf(t.group));
    expect((await t.groups.get(R, t.group.id)).myMemberInvite).toBeUndefined();
    expect(inviteOfIn(await t.groups.members(OWNER, t.group.id), R)).toBeUndefined();
  });

  it('GRP-42: removida no meio da saída (not_member) → GROUP_MEMBER_NOT_FOUND', async () => {
    const t = await setup({ members: [A] });
    t.store.removeScript.push(() => 'not_member');
    await expectAppError(t.groups.leave(A, t.group.id), 'GROUP_MEMBER_NOT_FOUND', 404);
    expect(t.sent).toEqual([]);
  });

  it('GRP-42: o papel mudou no meio (stale) → relê e sai com o papel novo', async () => {
    const t = await setup({ reserves: [R] });
    t.store.removeScript.push((args) => {
      t.store.promote(args.group.id, args.userId);
      return 'stale';
    });
    await t.groups.leave(R, t.group.id);
    expect(t.store.removeCalls).toHaveLength(2);
    expect(t.store.removeCalls[0]?.role).toBe('reserve');
    expect(t.store.removeCalls[1]?.role).toBe('member');
    expect(t.store.membershipOf(t.group.id, R)).toBeUndefined();
  });

  it('GRP-42: quem não participa tenta sair → GROUP_NOT_FOUND (GRP-04)', async () => {
    const t = await setup();
    await expectAppError(t.groups.leave(OUTSIDER, t.group.id), 'GROUP_NOT_FOUND', 404);
  });
});

describe('grupo arquivado barra limites, convite e saída (GRP-32)', () => {
  it('GRP-32: mudar os limites, convidar, cancelar o convite, aceitar, recusar e sair → GROUP_ARCHIVED e nada muda', async () => {
    const t = await setup({ members: [A], reserves: [R, D] });
    await t.groups.inviteToMember(OWNER, t.group.id, R);
    await t.groups.inviteToMember(OWNER, t.group.id, D);
    await t.groups.archive(OWNER, t.group.id);
    t.sent.splice(0);
    const before = t.store.storedGroup(t.group.id);
    await expectAppError(t.groups.update(OWNER, t.group.id, { maxMembers: 5 }), 'GROUP_ARCHIVED', 409);
    await expectAppError(t.groups.inviteToMember(OWNER, t.group.id, R), 'GROUP_ARCHIVED', 409);
    await expectAppError(t.groups.cancelMemberInvite(OWNER, t.group.id, R), 'GROUP_ARCHIVED', 409);
    await expectAppError(t.groups.acceptMemberInvite(R, t.group.id), 'GROUP_ARCHIVED', 409);
    await expectAppError(t.groups.declineMemberInvite(D, t.group.id), 'GROUP_ARCHIVED', 409);
    await expectAppError(t.groups.leave(A, t.group.id), 'GROUP_ARCHIVED', 409);
    expect(t.store.storedGroup(t.group.id)).toEqual(before);
    const list = await t.groups.members(OWNER, t.group.id);
    expect(ids(list).sort()).toEqual([OWNER, A, R, D].sort());
    expect(roleOfIn(list, R)).toBe('reserve');
    expect(inviteOfIn(list, R)).toBe(IN_7_DAYS);
    expect(inviteOfIn(list, D)).toBe(IN_7_DAYS);
    expect(t.store.removeCalls).toEqual([]);
    expect(t.sent).toEqual([]);
  });
});
