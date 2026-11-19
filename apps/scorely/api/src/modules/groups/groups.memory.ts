import { randomUUID } from 'node:crypto';
import { AppError, appError } from '@scorely/api/src/lib/errors';
import { asUserId, type UserId } from '@scorely/api/src/lib/ids';
import { gameIdOf, zonedToUtc } from '@scorely/api/src/lib/zoned';
import type {
  GameRecord,
  GameRepository,
  PlayerRecord,
} from '@scorely/api/src/modules/groups/game.repository';
import { createGameService } from '@scorely/api/src/modules/groups/game.service';
import type {
  GroupRepository,
  RemoveMemberResult,
  StoredGroup,
} from '@scorely/api/src/modules/groups/group.repository';
import { createGroupService } from '@scorely/api/src/modules/groups/group.service';
import type { PlaceRepository, StoredPlace } from '@scorely/api/src/modules/groups/place.repository';
import { createPlaceService } from '@scorely/api/src/modules/groups/place.service';
import type { ScheduleRepository, StoredSchedule } from '@scorely/api/src/modules/groups/schedule.repository';
import { createScheduleService } from '@scorely/api/src/modules/groups/schedule.service';
import type { NewNotification } from '@scorely/api/src/modules/notifications/notification.service';
import type { UserRecord } from '@scorely/api/src/modules/users/user.repository';
import {
  type CreateGroupInput,
  type ErrorCode,
  type Group,
  type InviteKind,
  type MemberTier,
  type Notification,
  type Permission,
  type PlaceInput,
  PlaceInputSchema,
  type Preferences,
  type PublicUserId,
  PublicUserIdSchema,
  type RoleId,
  type ScheduleInput,
  type Sport,
} from '@scorely/contracts';
import { expect } from 'vitest';

/** ADR 0016: o que o banco faz na gravação condicionada pela versão (o repositório lança o mesmo erro). */
export function expectVersionIn(current: number, expected: number): void {
  if (current !== expected) throw appError('VERSION_CONFLICT', { currentVersion: current });
}

// Plano 003, bloco 2: casos 1, 2, 3 (api), 4 (service), 5, 6, 7, 8, 10–13 e a corrida na criação do jogo (tarefa 6a).
// Plano 006: casos 11–13 (remoção de membro com `not_member`/`stale`).
// Plano 007 (E2): casos 1–15 (reservas, link do jogo e camadas).
// Plano 013 (Membership): casos 1–16, no fim do arquivo.
// Partição do grupo (ADR 0014/0015, .claude/work/grupo-particao.md): o repositório em memória já está no formato
// novo: o grupo não guarda o dono; a participação tem o papel (`tier`) e o cargo (`roleId`, sempre presente, GRP-48).

export type ReadOpts = { consistent?: boolean };
export type Stored = StoredGroup;
export type RemoveArgs = Parameters<GroupRepository['removeMember']>[0];
export type GroupPatch = Parameters<GroupRepository['update']>[1];
export type ArchiveResult = Awaited<ReturnType<GroupRepository['archive']>>;
export type UnarchiveArgs = { group: Stored; tokens: Parameters<GroupRepository['unarchive']>[1] };
export type UnarchiveResult = Awaited<ReturnType<GroupRepository['unarchive']>>;
/** Participação no fake (plano 013, D2): o `MembershipRecord` sem `groupId`, que é a chave do mapa. */
export type MembershipRow = {
  userId: UserId;
  tier: MemberTier;
  createdAt: string;
  /** Prazo do convite para membro pendente (GRP-40), o item `MEMBER_INVITE#<userId>` no Dynamo. */
  memberInviteExpiresAt?: string;
  /** O cargo (GRP-48, 50): `owner` é o dono; quem entra, `member`. */
  roleId: RoleId;
};
export type TransferArgs = Parameters<GroupRepository['transfer']>[0];
export type TransferResult = Awaited<ReturnType<GroupRepository['transfer']>>;
export type AddMemberResult = 'added' | 'promoted' | 'unchanged' | 'members_full' | 'reserves_full' | 'stale';
export type AcceptInviteResult = 'promoted' | 'invalid' | 'members_full' | 'stale';
export const DAY = 24 * 60 * 60 * 1000;

export const MINUTE = 60 * 1000;
export const iso = (value: string | Date) => new Date(value).toISOString();

/** Quinta 2026-11-05 10:00 em São Paulo. */
export const THURSDAY_10H = new Date('2026-11-05T13:00:00.000Z');
/** Quinta 2026-11-05 19:00 em São Paulo (24 h antes do jogo: abertura das reservas por padrão). */
export const THURSDAY_19H = new Date('2026-11-05T22:00:00.000Z');
/** Sexta 2026-11-06 13:00 em São Paulo (6 h antes do jogo). */
export const FRIDAY_13H = new Date('2026-11-06T16:00:00.000Z');
/** Sexta 2026-11-06 20:00 em São Paulo (jogo de 19h em andamento). */
export const FRIDAY_20H = new Date('2026-11-06T23:00:00.000Z');
/** Sexta 2026-11-06 22:01 em São Paulo (passou a janela de 3 h). */
export const FRIDAY_22H01 = new Date('2026-11-07T01:01:00.000Z');
/** Quarta 2026-11-04 19:00 em São Paulo (48 h antes: abertura dos membros). */
export const WEDNESDAY_19H = new Date('2026-11-04T22:00:00.000Z');
export const DATE = '2026-11-06';
export const NEXT_DATE = '2026-11-13';

export const OWNER = asUserId('11111111-1111-4111-8111-111111111111');
export const A = asUserId('22222222-2222-4222-8222-222222222222');
export const B = asUserId('33333333-3333-4333-8333-333333333333');
export const C = asUserId('44444444-4444-4444-8444-444444444444');
export const D = asUserId('55555555-5555-4555-8555-555555555555');
export const OUTSIDER = asUserId('66666666-6666-4666-8666-666666666666');
export const LISBON_OWNER = asUserId('77777777-7777-4777-8777-777777777777');
/** Reserva (entra pelo link de reserva). */
export const R = asUserId('88888888-8888-4888-8888-888888888888');
/** Convidado (só pelo link do jogo). */
export const G = asUserId('99999999-9999-4999-8999-999999999999');
/** Conta que nunca trocou o apelido: ele continua igual ao código de amigo (USR-02). */
export const N = asUserId('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');

/**
 * Id público de cada pessoa do teste (USR-15): os 8 primeiros caracteres do id do sistema, em maiúsculas. `sys` faz
 * o caminho inverso; um id que não é público (ex.: o uuid do sistema) não acha ninguém, e o teste que o compara falha.
 */
export const pub = (id: UserId): PublicUserId => PublicUserIdSchema.parse(id.slice(0, 8).toUpperCase());

export const user = (id: UserId, extra: Partial<UserRecord> = {}): UserRecord => ({
  id,
  publicId: pub(id),
  nickname: pub(id),
  createdAt: '2026-01-01T00:00:00.000Z',
  version: 1,
  ...extra,
});

export const USERS: UserRecord[] = [
  user(OWNER, { nickname: 'Dono' }),
  user(A, { nickname: 'Ana' }),
  user(B, { nickname: 'Bia' }),
  user(C, { nickname: 'Caio' }),
  user(D, { nickname: 'Duda' }),
  user(OUTSIDER, { nickname: 'Fora' }),
  user(LISBON_OWNER, { nickname: 'Lis' }),
  user(R, { nickname: 'Rafa' }),
  user(G, { nickname: 'Gabi' }),
  user(N),
];

export const BY_PUBLIC = new Map<string, UserId>(USERS.map((u) => [u.publicId, u.id]));
/** Id público → id do sistema (para comparar a saída com as constantes). */
export const sys = (publicId: string): UserId | undefined => BY_PUBLIC.get(publicId);

/** Preferências de cada pessoa (USR-07): o fuso fica fora do perfil (usuarios.md, seção 3). */
export const PREFERENCES = new Map<UserId, Preferences>([
  [LISBON_OWNER, { locale: 'pt-BR', timeZone: 'Europe/Lisbon' }],
]);

export const BASE_INPUT: CreateGroupInput = {
  name: 'Vôlei de sexta',
  sportId: 'volleyball',
  weekday: 5,
  start: '19:00',
  end: '22:00',
  slots: 12,
  listOpensHoursBefore: 48,
};
export const INPUT: CreateGroupInput = { ...BASE_INPUT, timeZone: 'America/Sao_Paulo' };

export const KINDS: InviteKind[] = ['member', 'reserve', 'guest'];
/** Campo do grupo com o token de cada tipo de link (plano 007, D5). */
export const TOKEN_FIELD = {
  member: 'inviteToken',
  reserve: 'reserveInviteToken',
  guest: 'guestToken',
} as const;

/**
 * Repositórios em memória com o estado compartilhado (o `removeMember` do grupo apaga a presença do jogo, D12).
 * Participações no formato da ADR 0015: uma `MEMBER#<userId>` por (grupo, usuário), com `tier`, `roleId` e `createdAt`
 * (data de entrada, nunca muda, GRP-03). Como no Dynamo, `listMembers` e `groupsOf` voltam na
 * ordem da chave (userId / groupId), não na de entrada: quem ordena a lista é o service (D4, D9).
 * O papel de um token sai de qual campo do grupo ele ocupa (D5 do 007).
 * O `get` devolve o grupo como foi gravado (grupo antigo continua sem os campos da E2, D3).
 * `race.stale`: a próxima leitura não consistente do jogo pelo id não enxerga nada (simula a corrida do D2).
 * Jogo no modelo da ADR 0015 (`.claude/work/horarios-jogo.md`): `GAME#<scheduleId>_<data>` e `PLAYER#<userId>`; a
 * própria chave impede dois jogos da mesma ocorrência. Os horários (`SCHEDULE#`) moram ao lado do grupo, com o
 * `scheduleCount` e o `scheduleRevision` do COUNTERS; o grupo é lido com os horários ativos.
 */
export function memoryStore(now: () => Date = () => new Date()) {
  const groups = new Map<string, Stored>();
  const memberships = new Map<string, Map<string, MembershipRow>>();
  const games = new Map<string, GameRecord>();
  const attendance = new Map<string, PlayerRecord>();
  const race = { stale: false };
  /** As opções de cada leitura do jogo pelo id (a corrida da criação relê consistente, GRP-10). */
  const getReads: (ReadOpts | undefined)[] = [];
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
    beforeAddAttendance: ((a: PlayerRecord, groupId: string) => void)[];
    /** Corrida da reabertura (GRP-44): roda uma vez dentro do `reopen`, antes das condições da transação. */
    beforeReopen: ((gameId: string, groupId: string) => void)[];
    /**
     * Corrida da entrada (GRP-39): roda uma vez dentro do `addMember`/`acceptMemberInvite`, antes das condições,
     * como se outra entrada, a troca do limite ou o arquivamento tivesse sido gravado depois da leitura do service.
     */
    beforeAddMember: ((groupId: string, userId: string) => void)[];
    /** Corrida do aviso de jogo confirmado (GRP-47): roda uma vez dentro do `markMinReached`, antes da condição. */
    beforeMarkMinReached: ((gameId: string) => void)[];
    /** Corrida do lugar padrão (GRP-62): roda uma vez dentro do `update` do grupo, antes do ConditionCheck do lugar. */
    beforeGroupUpdate: ((groupId: string) => void)[];
    /** Corrida dos horários (GRP-64, 65): roda uma vez dentro da escrita de um horário, antes das condições. */
    beforeScheduleWrite: ((groupId: string) => void)[];
    /** Corrida do jogo extra e do remarcar (GRP-70): roda uma vez dentro do `createExtra`/`reschedule`, antes das condições. */
    beforeGameWrite: ((groupId: string) => void)[];
  } = {
    beforeAddAttendance: [],
    beforeReopen: [],
    beforeAddMember: [],
    beforeMarkMinReached: [],
    beforeGroupUpdate: [],
    beforeScheduleWrite: [],
    beforeGameWrite: [],
  };
  /** Chamadas ao `addMember` e ao `acceptMemberInvite` do repositório (cópia do grupo recebido). */
  const addCalls: { group: Stored; userId: string; tier: MemberTier }[] = [];
  const acceptCalls: { group: Stored; userId: string; now: string }[] = [];
  /** Chamadas ao `reopen` do repositório (GRP-44). */
  const reopenCalls: { gameId: string; groupId: string }[] = [];
  /** Chamadas ao `markMinReached` do repositório (GRP-47). */
  const markMinReachedCalls: { gameId: string; at: string }[] = [];
  /** Chamadas ao `transfer` do repositório (GRP-54) e respostas forçadas, consumidas na ordem. */
  const transferCalls: TransferArgs[] = [];
  const transferScript: ((args: TransferArgs) => TransferResult)[] = [];
  /** Grava o cargo direto na participação, como o `setStaffRole` do repositório. */
  const forceStaffRole = (groupId: string, userId: string, roleId: RoleId) => {
    const m = memberships.get(groupId)?.get(userId);
    if (!m) return;
    groupMemberships(groupId).set(userId, { ...m, roleId });
  };
  /** Grava o `minReachedAt` direto no item do jogo (outra escrita avisou antes, GRP-47). */
  const forceMinReached = (gameId: string, at: string) => {
    const g = games.get(gameId);
    if (g) games.set(gameId, { ...g, minReachedAt: at });
  };

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
  const roleIn = (groupId: string, userId: string) => memberships.get(groupId)?.get(userId)?.tier;
  /** O cargo gravado na participação (GRP-48). */
  const roleIdIn = (groupId: string, userId: string) => memberships.get(groupId)?.get(userId)?.roleId;
  /** Entrar (GRP-48): por qualquer caminho, com o cargo Membro; o dono nasce com o `owner` (GRP-01). */
  const insert = (groupId: string, userId: string, tier: MemberTier, roleId: RoleId = 'member') =>
    groupMemberships(groupId).set(userId, {
      userId: asUserId(userId),
      tier,
      roleId,
      createdAt: now().toISOString(),
    });
  /** Reserva → membro com 1 Update: mantém o `createdAt` (GRP-03) e o cargo (GRP-48) e apaga o convite (GRP-41). */
  const promote = (groupId: string, userId: string) => {
    const m = memberships.get(groupId)?.get(userId);
    if (m?.tier !== 'reserve') return;
    const { memberInviteExpiresAt: _invite, ...rest } = m;
    groupMemberships(groupId).set(userId, { ...rest, tier: 'member' });
  };
  /** Contagem por papel (o item `COUNTERS` do Dynamo, GRP-39), sempre igual às participações gravadas. */
  const countOf = (groupId: string, tier: MemberTier) =>
    [...groupMemberships(groupId).values()].filter((m) => m.tier === tier).length;
  const LIMIT_FIELD = { member: 'maxMembers', reserve: 'maxReserves' } as const;
  const limitOf = (g: Stored, tier: MemberTier) => (g as Record<string, unknown>)[LIMIT_FIELD[tier]];
  /** Grava um limite direto no item do grupo (o dono trocou o limite entre a leitura e a gravação). */
  const forceLimit = (groupId: string, tier: MemberTier, value: number) => {
    const stored = groups.get(groupId);
    if (stored) groups.set(groupId, { ...stored, [LIMIT_FIELD[tier]]: value });
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
  const dropAttendance = (a: PlayerRecord) => attendance.delete(attKey(a.gameId, a.userId));
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
  /**
   * A transação do GRP-54: condicional em `from` ainda ter o `roleId = owner` e o grupo sem `archivedAt` (senão
   * `stale`); o `to` existe e é membro (senão `not_member`) e recebe o `owner` no lugar do cargo que tinha; o `from`
   * vira Admin. Assim, nunca há dois donos.
   */
  const naturalTransfer = (args: TransferArgs): TransferResult => {
    const stored = groups.get(args.group.id);
    if (!stored || roleIdIn(args.group.id, args.from) !== 'owner' || stored.archivedAt !== undefined)
      return 'stale';
    if (roleIn(args.group.id, args.to) !== 'member') return 'not_member';
    forceStaffRole(args.group.id, args.to, 'owner');
    forceStaffRole(args.group.id, args.from, 'admin');
    return 'transferred';
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
    if (current !== args.tier || !stored) return 'stale';
    if (args.newToken !== undefined && tokenIn(stored, args.tier) !== tokenIn(args.group, args.tier))
      return 'stale';
    drop(args.group.id, args.userId);
    if (args.newToken !== undefined) swapToken(args.group.id, args.tier, args.newToken);
    for (const p of args.players ?? []) dropAttendance(p);
    return 'removed';
  };
  /** Condição do limite dentro da gravação (GRP-39): limite trocado ou grupo arquivado depois da leitura → `stale`. */
  const limitChanged = (group: Stored, tier: MemberTier) => {
    const stored = groups.get(group.id);
    return !stored || stored.archivedAt !== undefined || limitOf(stored, tier) !== limitOf(group, tier);
  };
  const isFull = (group: Stored, tier: MemberTier) => countOf(group.id, tier) >= Number(limitOf(group, tier));
  /** O `addMember` como o Dynamo faria (GRP-02, 39). */
  const naturalAdd = (group: Stored, userId: string, tier: MemberTier): AddMemberResult => {
    const current = roleIn(group.id, userId);
    // GRP-02: membro aceitando o link de reserva continua membro; entrar de novo não muda nada.
    if (current === 'member' || current === tier) return 'unchanged';
    if (limitChanged(group, tier)) return 'stale';
    if (isFull(group, tier)) return tier === 'member' ? 'members_full' : 'reserves_full';
    if (current === 'reserve') {
      promote(group.id, userId);
      return 'promoted';
    }
    insert(group.id, userId, tier);
    return 'added';
  };
  /** O aceite do convite como o Dynamo faria (GRP-41): `tier = :reserve` e o convite com `expiresAt > :now`. */
  const naturalAccept = (group: Stored, userId: string, at: string): AcceptInviteResult => {
    const m = memberships.get(group.id)?.get(userId);
    if (m?.tier !== 'reserve' || m.memberInviteExpiresAt === undefined || m.memberInviteExpiresAt <= at)
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

  /**
   * Lugares do grupo (GRP-60, 61), `GROUP#g/PLACE#<id>`, na ordem de criação. Como o Dynamo: o `placeCount` com
   * condição (`< 10`) no `create` e no `unarchive`; o `archive` com o ConditionCheck no `SETTINGS` (o padrão não sai);
   * a versão conferida em toda edição (ADR 0016).
   */
  const places = new Map<string, StoredPlace[]>();
  const placesOf = (groupId: string) => places.get(groupId) ?? [];
  const activeCount = (groupId: string) => placesOf(groupId).filter((x) => x.archivedAt === undefined).length;
  const copyPlace = (place: StoredPlace): StoredPlace => ({ ...place, address: { ...place.address } });
  const findPlace = (groupId: string, placeId: string) => placesOf(groupId).find((x) => x.id === placeId);
  const savePlace = (place: StoredPlace) => {
    places.set(
      place.groupId,
      placesOf(place.groupId).map((x) => (x.id === place.id ? place : x)),
    );
    return copyPlace(place);
  };
  /** Arquiva um lugar direto no banco (outra pessoa arquivou entre a leitura e a gravação). */
  const forceArchivePlace = (groupId: string, placeId: string, at: string) => {
    const found = findPlace(groupId, placeId);
    if (found) savePlace({ ...found, archivedAt: at });
  };
  const placeRepo: PlaceRepository = {
    list: async (groupId: string) => placesOf(groupId).map(copyPlace),
    async get(groupId: string, placeId: string) {
      const found = findPlace(groupId, placeId);
      return found && copyPlace(found);
    },
    async create(place: Omit<StoredPlace, 'version'>) {
      if (activeCount(place.groupId) >= 10) throw appError('PLACE_LIMIT_REACHED', { max: 10 });
      places.set(place.groupId, [...placesOf(place.groupId), copyPlace({ ...place, version: 1 })]);
    },
    async update(groupId: string, placeId: string, input: PlaceInput, expectedVersion: number) {
      const found = findPlace(groupId, placeId);
      if (!found) throw appError('PLACE_NOT_FOUND');
      expectVersionIn(found.version, expectedVersion);
      const parsed = PlaceInputSchema.parse(input);
      return savePlace({ ...found, ...parsed, version: found.version + 1, updatedAt: now().toISOString() });
    },
    async archive(groupId: string, placeId: string, expectedVersion: number, at: string) {
      const found = findPlace(groupId, placeId);
      if (!found) throw appError('PLACE_NOT_FOUND');
      if (found.archivedAt !== undefined) return copyPlace(found);
      if (groups.get(groupId)?.defaultPlaceId === placeId) throw appError('PLACE_IS_DEFAULT');
      expectVersionIn(found.version, expectedVersion);
      return savePlace({ ...found, archivedAt: at, version: found.version + 1, updatedAt: at });
    },
    async unarchive(groupId: string, placeId: string, expectedVersion: number) {
      const found = findPlace(groupId, placeId);
      if (!found) throw appError('PLACE_NOT_FOUND');
      if (found.archivedAt === undefined) return copyPlace(found);
      expectVersionIn(found.version, expectedVersion);
      if (activeCount(groupId) >= 10) throw appError('PLACE_LIMIT_REACHED', { max: 10 });
      const { archivedAt: _archivedAt, ...rest } = found;
      return savePlace({ ...rest, version: found.version + 1, updatedAt: now().toISOString() });
    },
  };

  /**
   * Horários do grupo (GRP-64–67), `GROUP#g/SCHEDULE#<id>`. Como o Dynamo: o `scheduleCount` (ativos) e o
   * `scheduleRevision` do COUNTERS conferidos e somados em toda escrita; a versão conferida em toda edição (ADR 0016).
   */
  const schedules = new Map<string, StoredSchedule[]>();
  const scheduleCounters = new Map<string, { scheduleCount: number; scheduleRevision: number }>();
  const schedulesOf = (groupId: string) => schedules.get(groupId) ?? [];
  const countersOf = (groupId: string) =>
    scheduleCounters.get(groupId) ?? { scheduleCount: 0, scheduleRevision: 0 };
  const bumpSchedules = (groupId: string, delta: number) => {
    const c = countersOf(groupId);
    scheduleCounters.set(groupId, {
      scheduleCount: c.scheduleCount + delta,
      scheduleRevision: c.scheduleRevision + 1,
    });
  };
  const byWeekdayAndStart = (x: StoredSchedule, y: StoredSchedule) =>
    x.weekday - y.weekday || x.start.localeCompare(y.start);
  const activeSchedules = (groupId: string) =>
    schedulesOf(groupId)
      .filter((x) => x.archivedAt === undefined)
      .sort(byWeekdayAndStart)
      .map((x) => ({ ...x }));
  const findSchedule = (groupId: string, scheduleId: string) =>
    schedulesOf(groupId).find((x) => x.id === scheduleId);
  const saveSchedule = (schedule: StoredSchedule) => {
    schedules.set(
      schedule.groupId,
      schedulesOf(schedule.groupId).map((x) => (x.id === schedule.id ? schedule : x)),
    );
    return { ...schedule };
  };
  /** Grava um horário direto no banco (outra escrita entre a leitura e a gravação do service). */
  const forceSchedule = (schedule: Omit<StoredSchedule, 'version'>) => {
    schedules.set(schedule.groupId, [...schedulesOf(schedule.groupId), { ...schedule, version: 1 }]);
    bumpSchedules(schedule.groupId, 1);
  };
  const runScheduleHooks = (groupId: string) => {
    for (const hook of hooks.beforeScheduleWrite.splice(0)) hook(groupId);
  };
  /** Chamadas de escrita do repositório de horários que voltaram `stale` (o service relê e tenta de novo). */
  const scheduleStale: string[] = [];
  const scheduleRepo: ScheduleRepository = {
    async list(groupId: string) {
      return {
        schedules: [...schedulesOf(groupId)].sort(byWeekdayAndStart).map((x) => ({ ...x })),
        revision: countersOf(groupId).scheduleRevision,
      };
    },
    async get(groupId: string, scheduleId: string) {
      const found = findSchedule(groupId, scheduleId);
      return found && { ...found };
    },
    async create(schedule: Omit<StoredSchedule, 'version'>, revision: number, max: number) {
      runScheduleHooks(schedule.groupId);
      const c = countersOf(schedule.groupId);
      if (c.scheduleRevision !== revision) {
        scheduleStale.push('create');
        return 'stale' as const;
      }
      if (c.scheduleCount >= max) throw appError('SCHEDULE_LIMIT_REACHED', { max });
      schedules.set(schedule.groupId, [...schedulesOf(schedule.groupId), { ...schedule, version: 1 }]);
      bumpSchedules(schedule.groupId, 1);
      return 'created' as const;
    },
    async update(
      groupId: string,
      scheduleId: string,
      fields: ScheduleInput,
      expectedVersion: number,
      revision: number,
    ) {
      runScheduleHooks(groupId);
      const found = findSchedule(groupId, scheduleId);
      if (!found) throw appError('SCHEDULE_NOT_FOUND');
      expectVersionIn(found.version, expectedVersion);
      if (countersOf(groupId).scheduleRevision !== revision) {
        scheduleStale.push('update');
        return 'stale' as const;
      }
      bumpSchedules(groupId, 0);
      const { placeId: _p, slots: _s, minPlayers: _m, ...base } = found;
      return saveSchedule({
        ...base,
        ...fields,
        version: found.version + 1,
        updatedAt: now().toISOString(),
      });
    },
    async archive(groupId: string, scheduleId: string, expectedVersion: number, at: string) {
      const found = findSchedule(groupId, scheduleId);
      if (!found) throw appError('SCHEDULE_NOT_FOUND');
      if (found.archivedAt !== undefined) return { ...found };
      expectVersionIn(found.version, expectedVersion);
      if (countersOf(groupId).scheduleCount <= 1) throw appError('SCHEDULE_LAST');
      bumpSchedules(groupId, -1);
      return saveSchedule({ ...found, archivedAt: at, version: found.version + 1, updatedAt: at });
    },
    async unarchive(
      groupId: string,
      scheduleId: string,
      expectedVersion: number,
      revision: number,
      max: number,
    ) {
      runScheduleHooks(groupId);
      const found = findSchedule(groupId, scheduleId);
      if (!found) throw appError('SCHEDULE_NOT_FOUND');
      if (found.archivedAt === undefined) return { ...found };
      expectVersionIn(found.version, expectedVersion);
      const c = countersOf(groupId);
      if (c.scheduleRevision !== revision) {
        scheduleStale.push('unarchive');
        return 'stale' as const;
      }
      if (c.scheduleCount >= max) throw appError('SCHEDULE_LIMIT_REACHED', { max });
      bumpSchedules(groupId, 1);
      const { archivedAt: _archivedAt, ...rest } = found;
      return saveSchedule({ ...rest, version: found.version + 1, updatedAt: now().toISOString() });
    },
  };
  /** O grupo como o repositório devolve: com os horários ativos, lidos junto (GRP-64). */
  const withSchedules = (g: Stored): Stored => ({ ...g, schedules: activeSchedules(g.id) });

  const groupRepo: GroupRepository = {
    ...legacy,
    /** Aceita qualquer opção de leitura (ex.: ler o `INVITES` só quando precisa): o fake devolve o grupo inteiro. */
    async get(id: string, _opts?: ReadOpts & Record<string, unknown>) {
      reads.get += 1;
      const g = groups.get(id);
      return g && withSchedules(g);
    },
    async getByToken(token: string) {
      const found = findByToken(token);
      return found && { ...found, group: withSchedules(found.group) };
    },
    /** GRP-01, 48: o grupo nasce com o criador membro e com o cargo Dono. */
    /** ADR 0013: o META e o SETTINGS nascem com a version 1. GRP-64: o 1º horário vai na mesma transação. */
    async create(group: Stored, ownerId: UserId, firstSchedule: Omit<StoredSchedule, 'version'>) {
      groups.set(group.id, { ...group, schedules: [], version: 1, settingsVersion: 1 });
      insert(group.id, ownerId, 'member', 'owner');
      forceSchedule(firstSchedule);
    },
    async roleOf(groupId: string, userId: string) {
      reads.roleOf += 1;
      return roleIn(groupId, userId);
    },
    async addMember(group: Stored, userId: string, tier: MemberTier): Promise<AddMemberResult> {
      addCalls.push({ group: { ...group }, userId, tier });
      for (const hook of hooks.beforeAddMember.splice(0)) hook(group.id, userId);
      return naturalAdd(group, userId, tier);
    },
    async counts(groupId: string) {
      return { memberCount: countOf(groupId, 'member'), reserveCount: countOf(groupId, 'reserve') };
    },
    async getMembership(groupId: string, userId: string) {
      const m = memberships.get(groupId)?.get(userId);
      if (!m) return undefined;
      return {
        tier: m.tier,
        roleId: m.roleId,
        ...(m.memberInviteExpiresAt === undefined ? {} : { memberInviteExpiresAt: m.memberInviteExpiresAt }),
      };
    },
    /** GRP-51: grava o `roleId` (tirar o Admin grava `member`). A participação sumiu → `not_member`. */
    async setStaffRole(groupId: string, userId: UserId, roleId: RoleId) {
      if (!memberships.get(groupId)?.get(userId)) return 'not_member' as const;
      forceStaffRole(groupId, userId, roleId);
      return 'set' as const;
    },
    /** Ver `naturalTransfer`; `transferScript` força a resposta (corridas). */
    async transfer(args: TransferArgs): Promise<TransferResult> {
      transferCalls.push({ ...args, group: { ...args.group } });
      const scripted = transferScript.shift();
      return scripted ? scripted(args) : naturalTransfer(args);
    },
    async setMemberInvite(groupId: string, userId: string, expiresAt: string) {
      const m = memberships.get(groupId)?.get(userId);
      if (m?.tier !== 'reserve') return 'not_reserve' as const;
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
        .map(({ userId, tier, roleId, createdAt, memberInviteExpiresAt }) => ({
          userId,
          tier,
          roleId,
          createdAt,
          ...(memberInviteExpiresAt === undefined ? {} : { memberInviteExpiresAt }),
        })),
    async groupsOf(userId: string) {
      reads.groupsOf += 1;
      return [...memberships.entries()]
        .sort(([x], [y]) => byKey(x, y))
        .flatMap(([groupId, list]) => {
          const m = list.get(userId);
          const g = groups.get(groupId);
          return m && g ? [{ group: withSchedules(g), tier: m.tier, roleId: m.roleId }] : [];
        });
    },
    async rotateToken(group: Stored, kind: InviteKind, newToken: string) {
      swapToken(group.id, kind, newToken);
    },
    /** GRP-59 (ADR 0016): os Ajustes gravam só com a `settingsVersion` atual, e ela soma 1. */
    async update(groupId: string, patch: GroupPatch, expectedSettingsVersion: number) {
      const stored = groups.get(groupId);
      if (!stored) throw new Error('group not found in memory store');
      expectVersionIn(stored.settingsVersion, expectedSettingsVersion);
      // GRP-62: o ConditionCheck no `PLACE#` na mesma transação (o lugar existe e não está arquivado).
      for (const hook of hooks.beforeGroupUpdate.splice(0)) hook(groupId);
      if (typeof patch.defaultPlaceId === 'string') {
        const place = findPlace(groupId, patch.defaultPlaceId);
        if (!place || place.archivedAt !== undefined) throw appError('PLACE_NOT_FOUND');
      }
      const merged = Object.fromEntries(
        Object.entries({ ...stored, ...patch, settingsVersion: stored.settingsVersion + 1 }).filter(
          ([, v]) => v !== null && v !== undefined,
        ),
      ) as Stored;
      groups.set(groupId, merged);
      return withSchedules(merged);
    },
    /** GRP-71: o nome, com a `version` da identidade (o META); versão velha → `VERSION_CONFLICT`. */
    async rename(groupId: string, name: string, expectedVersion: number) {
      const stored = groups.get(groupId);
      if (!stored) throw new Error('group not found in memory store');
      expectVersionIn(stored.version, expectedVersion);
      const renamed = { ...stored, name, version: stored.version + 1 };
      groups.set(groupId, renamed);
      return withSchedules(renamed);
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

  const byEntry = (x: PlayerRecord, y: PlayerRecord) =>
    x.confirmedAt.localeCompare(y.confirmedAt) || x.userId.localeCompare(y.userId);
  const gameRepo: GameRepository = {
    async get(gameId: string, opts?: ReadOpts) {
      getReads.push(opts);
      if (race.stale && !opts?.consistent) {
        race.stale = false;
        return undefined;
      }
      const g = games.get(gameId);
      return g && { ...g };
    },
    /** O Put com `attribute_not_exists` (+ o lookup `LOOKUP#GROUP#g#GAME`): `false` = outro criou antes. */
    async create(game: GameRecord) {
      if (games.has(game.id)) return false;
      games.set(game.id, { ...game, version: game.version ?? 0 });
      return true;
    },
    async cancel(gameId: string, cancelledAt: string) {
      const g = games.get(gameId);
      if (g) games.set(gameId, { ...g, cancelledAt });
    },
    listPlayers: async (gameId: string, _opts?: ReadOpts) =>
      [...attendance.values()]
        .filter((a) => a.gameId === gameId)
        .sort(byEntry)
        .map((a) => ({ ...a })),
    async getPlayer(gameId: string, userId: string) {
      const a = attendance.get(attKey(gameId, userId));
      return a && { ...a };
    },
    /** Como a transação do Dynamo: o `PLAYER#` e os `ConditionCheck` do jogo e do grupo (os dois falhando → `archived`). */
    async addPlayer(a: PlayerRecord, groupId: string) {
      for (const hook of hooks.beforeAddAttendance.splice(0)) hook(a, groupId);
      const key = attKey(a.gameId, a.userId);
      if (attendance.has(key)) return 'exists' as const;
      if (groups.get(groupId)?.archivedAt !== undefined) return 'archived' as const;
      if (games.get(a.gameId)?.cancelledAt !== undefined) return 'cancelled' as const;
      attendance.set(key, { ...a });
      return 'added' as const;
    },
    async removePlayer(a: PlayerRecord) {
      dropAttendance(a);
    },
    /** Vagas e mínimo só do jogo (GRP-45, 46): `undefined` não mexe, `null` remove o campo. */
    async updateSettings(
      gameId: string,
      patch: { slots?: number | null; minPlayers?: number | null },
      expectedVersion: number,
    ) {
      const stored = games.get(gameId);
      if (!stored) throw new Error('game not found in memory store');
      expectVersionIn(stored.version ?? 0, expectedVersion);
      const given = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
      const merged = Object.fromEntries(
        Object.entries({ ...stored, ...given, version: (stored.version ?? 0) + 1 }).filter(
          ([, v]) => v !== null && v !== undefined,
        ),
      ) as unknown as GameRecord;
      games.set(gameId, merged);
      return { ...merged };
    },
    /** GRP-68, 70: o jogo extra e a revisão da agenda (a dos horários) na mesma transação; revisão velha → `stale`. */
    async createExtra(game: GameRecord, revision: number) {
      for (const hook of hooks.beforeGameWrite.splice(0)) hook(game.groupId);
      if (countersOf(game.groupId).scheduleRevision !== revision) {
        scheduleStale.push('createExtra');
        return 'stale' as const;
      }
      games.set(game.id, { ...game });
      bumpSchedules(game.groupId, 0);
      return 'created' as const;
    },
    /** GRP-69, 70: a versão do jogo e a revisão da agenda conferidas; o lookup muda com o início. */
    async reschedule(
      gameId: string,
      to: { date: string; startsAt: string; endsAt: string; placeId?: string },
      expectedVersion: number,
      revision: number,
    ) {
      const first = games.get(gameId);
      if (!first) throw new Error('game not found in memory store');
      for (const hook of hooks.beforeGameWrite.splice(0)) hook(first.groupId);
      // Relê depois do hook: outro request pode ter gravado entre a leitura do service e a transação.
      const stored = games.get(gameId) ?? first;
      expectVersionIn(stored.version ?? 0, expectedVersion);
      if (countersOf(stored.groupId).scheduleRevision !== revision) {
        scheduleStale.push('reschedule');
        return 'stale' as const;
      }
      const moved = {
        ...stored,
        date: to.date,
        startsAt: to.startsAt,
        endsAt: to.endsAt,
        ...(to.placeId !== undefined && { placeId: to.placeId }),
        rescheduledAt: now().toISOString(),
        updatedAt: now().toISOString(),
        version: (stored.version ?? 0) + 1,
      } as GameRecord;
      games.set(gameId, moved);
      bumpSchedules(stored.groupId, 0);
      return { ...moved };
    },
    /** Como o Update condicional do Dynamo (`attribute_not_exists(minReachedAt)`): `true` só para quem gravou. */
    async markMinReached(gameId: string, at: string) {
      markMinReachedCalls.push({ gameId, at });
      for (const hook of hooks.beforeMarkMinReached.splice(0)) hook(gameId);
      const g = games.get(gameId);
      if (!g || g.minReachedAt !== undefined) return false;
      games.set(gameId, { ...g, minReachedAt: at });
      return true;
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
    /** O lookup `LOOKUP#GROUP#g#GAME / <startsAt>#<gameId>`: os jogos que viraram item, em ordem de início. */
    listByGroup: async (groupId: string) =>
      [...games.values()]
        .filter((g) => g.groupId === groupId)
        .sort((x, y) => x.startsAt.localeCompare(y.startsAt) || x.id.localeCompare(y.id))
        .map((g) => ({ ...g })),
  };

  /** Regrava o grupo direto (ex.: um esporte desativado depois, ESP-05), sem mexer nas participações. */
  const seedGroup = (raw: Stored) => {
    groups.set(raw.id, { ...raw });
  };

  return {
    groups: groupRepo,
    games: gameRepo,
    places: placeRepo,
    schedules: scheduleRepo,
    schedulesOf,
    scheduleCounters: countersOf,
    scheduleStale,
    forceSchedule,
    placesOf,
    forceArchivePlace,
    race,
    getReads,
    removeCalls,
    removeScript,
    swapToken,
    seedGroup,
    reads,
    membershipOf,
    roleIdIn,
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
    markMinReachedCalls,
    forceMinReached,
    forceStaffRole,
    transferCalls,
    transferScript,
    naturalTransfer,

    /** O item do jogo de uma data do grupo (o de qualquer horário), se já virou item. */
    storedGame: (groupId: string, date: string) => {
      const g = [...games.values()].find((x) => x.groupId === groupId && x.date === date);
      return g && { ...g };
    },
    /** Grava um jogo direto (item) sem passar pelo service. */
    seedGame: (game: GameRecord) => {
      games.set(game.id, { ...game });
    },
    storedGameById: (gameId: string) => {
      const g = games.get(gameId);
      return g && { ...g };
    },
  };
}

export type Sent = { userId: UserId } & NewNotification;

/**
 * Catálogo de esportes do teste (ESP, GRP-58): o `sports.get` do `SportService`. `cricket` está desativado (ESP-05).
 * `sportReads` conta as leituras.
 */
export const sportOf = (id: string, active = true): Sport => ({
  id,
  name: { 'pt-BR': id, en: id },
  positions: [],
  active,
});
export const TEST_SPORTS: Sport[] = [
  sportOf('volleyball'),
  sportOf('soccer'),
  sportOf('basketball'),
  sportOf('cricket', false),
];

export function setupServices(now: Date = THURSDAY_10H) {
  const clock = { now };
  const store = memoryStore(() => clock.now);
  const sent: Sent[] = [];
  const sportReads: string[] = [];
  const byId = new Map(USERS.map((u) => [u.id, u]));
  const deps = {
    groups: store.groups,
    games: store.games,
    places: store.places,
    schedules: store.schedules,
    users: {
      get: async (id: UserId) => byId.get(id),
      getMany: async (ids: readonly UserId[]) => ids.flatMap((id) => byId.get(id) ?? []),
      getPreferences: async (id: UserId): Promise<Preferences> => PREFERENCES.get(id) ?? {},
      /** USR-17: id público → id do sistema; o desconhecido fica de fora. */
      resolve: async (publicIds: readonly PublicUserId[]) =>
        new Map(
          publicIds.flatMap((code) => {
            const id = BY_PUBLIC.get(code);
            return id === undefined ? [] : [[code, id] as const];
          }),
        ),
    },
    notifications: {
      async notify(userId: UserId, input: NewNotification): Promise<Notification> {
        sent.push({ userId, ...input });
        return { id: randomUUID(), createdAt: clock.now.toISOString(), ...input };
      },
    },
    /** MID-12: a URL é montada pelo id da mídia, com o endereço base. */
    media: {
      urlOf: (purpose: string, mediaId: string) => `https://uploads.test/public/${purpose}/${mediaId}`,
    },
    /** GRP-58: o esporte vem do catálogo (o desativado também volta, com `active: false`). */
    sports: {
      get: async (id: string) => {
        sportReads.push(id);
        return TEST_SPORTS.find((sp) => sp.id === id);
      },
    },
    now: () => clock.now,
  };
  const tick = () => {
    clock.now = new Date(clock.now.getTime() + MINUTE);
  };
  return {
    clock,
    store,
    sent,
    sportReads,
    tick,
    groups: createGroupService(deps),
    games: createGameService(deps),
    places: createPlaceService(deps),
    schedules: createScheduleService(deps),
    /** O 1º dos próximos jogos (GRP-11): o "jogo atual" dos testes de um horário só. */
    current: async (userId: UserId, groupId: string) => {
      const list = await createGameService(deps).upcoming(userId, groupId);
      expect(list.length).toBeGreaterThan(0);
      return list[0] as (typeof list)[number];
    },
    /** GRP-59: a versão dos Ajustes que a tela mostrou (a `settingsVersion` gravada). */
    sv: (groupId: string) => ({ version: store.storedGroup(groupId)?.settingsVersion ?? 0 }),
  };
}

export function tokenOf(group: Group): string {
  expect(group.inviteToken).toBeTypeOf('string');
  return group.inviteToken ?? '';
}

export function reserveTokenOf(group: Group): string {
  expect(group.reserveInviteToken).toBeTypeOf('string');
  return group.reserveInviteToken ?? '';
}

export function guestTokenOf(group: Group): string {
  expect(group.guestToken).toBeTypeOf('string');
  return group.guestToken ?? '';
}

export type SetupOpts = {
  slots?: number;
  listOpensHoursBefore?: number;
  reservesOpenHoursBefore?: number;
  guestsOpenHoursBefore?: number;
  /** Entram pelo link de membro. */
  members?: UserId[];
  /** Entram pelo link de reserva (depois dos membros). */
  reserves?: UserId[];
  now?: Date;
  /** Limites gravados direto no grupo antes das entradas (GRP-38). */
  maxMembers?: number;
  maxReserves?: number;
};

/** Grupo do OWNER (sexta 19h, São Paulo) com os `members` e as `reserves` entrando pelos links. */
export async function setup(opts: SetupOpts = {}) {
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
  /** O 1º horário (o do form de criar, GRP-34) e o id do jogo dele numa data (GRP-10). */
  const schedule = group.schedules[0] as Group['schedules'][number];
  const gameAt = (date: string) => gameIdOf(schedule.id, date);
  /** O jogo de sexta 06/11 do horário do grupo. */
  const gameId = gameAt(DATE);
  /** Confirma um por vez, avançando o relógio 1 min entre eles (`confirmedAt` define a ordem). */
  const confirmInOrder = async (...ids: UserId[]) => {
    for (const id of ids) {
      await s.games.confirm(id, group.id, gameId);
      s.tick();
    }
  };
  /** Como `confirmInOrder`, pelo link do jogo (`guestConfirm`). */
  const guestConfirmInOrder = async (...ids: UserId[]) => {
    for (const id of ids) {
      await s.games.guestConfirm(id, group.guestToken ?? '', gameId);
      s.tick();
    }
  };
  /** O item do jogo de uma data como o service o gravaria ao virar item (GRP-10: guarda o início e o fim). */
  const gameRecord = (date: string, extra: Partial<GameRecord> = {}): GameRecord => ({
    id: gameAt(date),
    groupId: group.id,
    scheduleId: schedule.id,
    date,
    startsAt: zonedToUtc(date, schedule.start, group.timeZone).toISOString(),
    endsAt: zonedToUtc(date, schedule.end, group.timeZone).toISOString(),
    createdAt: THURSDAY_10H.toISOString(),
    updatedAt: THURSDAY_10H.toISOString(),
    version: 1,
    ...extra,
  });
  return { ...s, group, schedule, gameAt, gameId, gameRecord, confirmInOrder, guestConfirmInOrder };
}

export async function expectAppError(
  p: Promise<unknown>,
  code: ErrorCode,
  status: number,
): Promise<AppError> {
  const err = await p.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  expect(err).toMatchObject({ code, status });
  return err as AppError;
}

/** GRP-04, 52: quem participa e não tem a permissão da ação recebe 403 com a permissão que faltou. */
export async function expectDenied(p: Promise<unknown>, permission: Permission): Promise<void> {
  const err = await expectAppError(p, 'GROUP_PERMISSION_DENIED', 403);
  expect(err.details).toEqual({ permission });
}

/** Os ids do sistema das pessoas da saída (que sai com o id público, USR-16). */
export const ids = (list: { userId: string }[]) => list.map((x) => sys(x.userId));
export const ofType = (sent: Sent[], type: Notification['type']) =>
  sent.filter((n) => n.type === type).map((n) => n.userId);
