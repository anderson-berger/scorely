import { appError } from '@scorely/api/src/lib/errors';
import { asGroupId, asPublicGroupId, asUserId, type UserId } from '@scorely/api/src/lib/ids';
import { createCompetitionService } from '@scorely/api/src/modules/groups/competitions/competitions.service';
import { memoryCompetitions } from '@scorely/api/src/modules/groups/competitions/data/competitions.memory';
import type { GroupAccess } from '@scorely/api/src/modules/groups/groups.access';
import { memoryMatches } from '@scorely/api/src/modules/groups/matches/data/matches.memory';
import { createMatchService } from '@scorely/api/src/modules/groups/matches/matches.service';
import type { UserRecord } from '@scorely/api/src/modules/users/users.access';
import type { GroupPermission, GroupTier } from '@scorely/contracts';

// O setup único da competição (ADR 0021): pessoas, grupo falso, relógio fake e repositórios em memória.

export const ANA = asUserId('11111111-1111-4111-8111-111111111111'); // Dono: matches.manage e competitions.manage
export const BIA = asUserId('22222222-2222-4222-8222-222222222222'); // sem permissão
export const CAIO = asUserId('33333333-3333-4333-8333-333333333333');
export const DUDA = asUserId('44444444-4444-4444-8444-444444444444'); // reserva
export const EDU = asUserId('55555555-5555-4555-8555-555555555555');
export const STRANGER = asUserId('99999999-9999-4999-8999-999999999999');
export const PUBLIC_ID = asPublicGroupId('K3X9PQ2A');
export const GROUP_ID = asGroupId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
export const PUB = {
  [ANA]: '1AAAAAAA',
  [BIA]: '2BBBBBBB',
  [CAIO]: '3CCCCCCC',
  [DUDA]: '4DDDDDDD',
  [EDU]: '5EEEEEEE',
} as Record<string, string>;
export const GENDER = { [ANA]: 'F', [BIA]: 'F', [CAIO]: 'M', [DUDA]: 'M', [EDU]: undefined } as Record<
  string,
  string | undefined
>;

/** Quarta, 25/11/2026, 12:00 em São Paulo. */
export const T0 = '2026-11-25T15:00:00.000Z';
export const POINTS = { win: 3, draw: 1, loss: 0 };
const JOINED_AT = '2026-01-01T00:00:00.000Z';

const EVERYONE: [UserId, GroupTier][] = [
  [ANA, 'member'],
  [BIA, 'member'],
  [CAIO, 'member'],
  [DUDA, 'reserve'],
  [EDU, 'member'],
];

/** Os perfis de `PUB` (com o gênero de `GENDER`), pelo `getMany`/`resolve` do diretório de usuários. */
const directory = {
  getMany: async (ids: readonly UserId[]): Promise<UserRecord[]> =>
    ids
      .filter((id) => PUB[id] !== undefined)
      .map(
        (id) =>
          ({
            id,
            publicId: PUB[id],
            nickname: (PUB[id] as string).toLowerCase(),
            gender: GENDER[id],
            createdAt: '2026-01-01T00:00:00.000Z',
            version: 1,
          }) as UserRecord,
      ),
  resolve: async (publicIds: readonly UserRecord['publicId'][]) =>
    new Map(
      Object.entries(PUB)
        .filter(([, pub]) => publicIds.includes(pub as UserRecord['publicId']))
        .map(([id, pub]) => [pub as UserRecord['publicId'], id as UserId]),
    ),
};

/**
 * Por padrão: Ana, Bia, Caio e Edu membros, Duda reserva; Ana com `matches.manage` e `competitions.manage`; os
 * perfis de `PUB`. `participants`, `matchManagers`, `holders` e `profiles: false` (nenhum perfil) mudam isso.
 */
export function setup(
  opts: {
    participants?: [UserId, GroupTier][];
    matchManagers?: UserId[];
    holders?: UserId[];
    profiles?: boolean;
  } = {},
) {
  const clock = { now: new Date(T0) };
  const state = {
    participants: new Map<UserId, GroupTier>(opts.participants ?? EVERYONE),
    matchManagers: new Set<UserId>(opts.matchManagers ?? [ANA]),
    competitionManagers: new Set<UserId>([ANA]),
  };
  const groups: GroupAccess = {
    access: async (userId, publicId) => {
      const tier = state.participants.get(userId);
      if (tier === undefined || publicId !== PUBLIC_ID) throw appError('GROUP_NOT_FOUND');
      const permissions: GroupPermission[] = [
        ...(state.matchManagers.has(userId) ? (['matches.manage'] as const) : []),
        ...(state.competitionManagers.has(userId) ? (['competitions.manage'] as const) : []),
      ];
      return { groupId: GROUP_ID, publicId: PUBLIC_ID, name: 'Pelada de sexta', tier, permissions };
    },
    participants: async () =>
      new Map([...state.participants].map(([id, tier]) => [id, { tier, joinedAt: JOINED_AT }])),
    holders: async () => opts.holders ?? [...state.matchManagers],
  };
  const users = opts.profiles === false ? { getMany: async () => [], resolve: directory.resolve } : directory;
  const store = memoryMatches();
  const { repo: competitions } = memoryCompetitions(store);
  const matchService = createMatchService({
    matches: store.repo,
    competitions,
    groups,
    users,
    notifications: { notify: async () => undefined } as never,
    now: () => clock.now,
  });
  const service = createCompetitionService({
    competitions,
    matches: store.repo,
    groups,
    users,
    now: () => clock.now,
  });
  const at = (when: string) => {
    clock.now = new Date(when);
  };
  return { service, matches: matchService, at, clock, state, store };
}
export type T = ReturnType<typeof setup>;

export async function failure(promise: Promise<unknown>) {
  try {
    await promise;
    return undefined;
  } catch (err) {
    return err as { code: string; status: number; details?: unknown };
  }
}

export function code(promise: Promise<unknown>) {
  return promise.then(
    () => undefined,
    (err: { code: string }) => err.code,
  );
}
