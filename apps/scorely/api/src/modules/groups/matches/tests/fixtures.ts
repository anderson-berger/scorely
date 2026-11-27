// O setup único dos testes de partidas (ADR 0021): pessoas, relógio fake, grupo falso, diretório de usuários, avisos
// guardados e o service pronto sobre o repositório em memória.
import { appError } from '@scorely/api/src/lib/errors';
import { asGroupId, asPublicGroupId, asUserId, type UserId } from '@scorely/api/src/lib/ids';
import type { GroupAccess } from '@scorely/api/src/modules/groups/groups.access';
import { memoryMatches } from '@scorely/api/src/modules/groups/matches/data/matches.memory';
import { createMatchService } from '@scorely/api/src/modules/groups/matches/matches.service';
import type { UserRecord } from '@scorely/api/src/modules/users/users.access';
import type { GroupPermission, GroupTier } from '@scorely/contracts';

export const ANA = asUserId('11111111-1111-4111-8111-111111111111'); // Dono: matches.manage
export const BIA = asUserId('22222222-2222-4222-8222-222222222222');
export const CAIO = asUserId('33333333-3333-4333-8333-333333333333');
export const DUDA = asUserId('44444444-4444-4444-8444-444444444444');
export const EDU = asUserId('55555555-5555-4555-8555-555555555555');
export const STRANGER = asUserId('99999999-9999-4999-8999-999999999999');
export const PUBLIC_ID = asPublicGroupId('K3X9PQ2A');
export const GROUP_ID = asGroupId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

/** O id público de cada pessoa. */
export const PUB = {
  [ANA]: '1AAAAAAA',
  [BIA]: '2BBBBBBB',
  [CAIO]: '3CCCCCCC',
  [DUDA]: '4DDDDDDD',
  [EDU]: '5EEEEEEE',
} as Record<string, string>;

export const HOUR = 3_600_000;
export const T0 = '2026-11-23T10:00:00.000Z';
/** Sexta, 27/11, 19h em São Paulo (UTC-3, sem horário de verão). */
export const START = '2026-11-27T22:00:00.000Z';
export const END = '2026-11-28T00:00:00.000Z';
export const ZONE = 'America/Sao_Paulo';
/** A sexta seguinte, 04/12, 19h em São Paulo. */
export const NEXT_START = '2026-12-04T22:00:00.000Z';
export const MEMBERS_AT = '2026-11-24T22:00:00.000Z'; // 72 h antes
export const RESERVES_AT = '2026-11-26T22:00:00.000Z'; // 24 h antes
export const GUESTS_AT = '2026-11-27T16:00:00.000Z'; // 6 h antes
export const JOINED_AT = '2026-01-01T00:00:00.000Z';

export const iso = (base: string, hours: number) => new Date(Date.parse(base) + hours * HOUR).toISOString();
export const link = (matchId: string) => `/groups/${PUBLIC_ID}/matches/${matchId}`;

export async function failure(promise: Promise<unknown>) {
  try {
    await promise;
    return undefined;
  } catch (err) {
    return err as { code: string; status: number; details?: unknown };
  }
}

/**
 * O grupo "Pelada de sexta" com as pessoas dadas (só elas têm perfil), ANA com `matches.manage`, o relógio em `T0` e
 * os avisos guardados em `sent`. No `state`: quem participa, quem gerencia, quem perdeu o perfil (PAR-28) e a data de
 * entrada de quem não entrou em `JOINED_AT` (PAR-10).
 */
export function matchesSetup(people: readonly (readonly [UserId, GroupTier])[]) {
  const clock = { now: new Date(T0) };
  const sent: { userId: UserId; type: string; link?: string | undefined }[] = [];
  const pub = Object.fromEntries(people.map(([id]) => [id, PUB[id]])) as Record<string, string>;
  const state = {
    participants: new Map<UserId, GroupTier>(people),
    managers: new Set<UserId>([ANA]),
    /** Quem perdeu o perfil (PAR-28): continua no grupo, mas o lookup de usuários não o acha. */
    noProfile: new Set<UserId>(),
    /** Data de entrada no grupo (PAR-10); quem não está aqui entrou antes de tudo. */
    joinedAt: new Map<UserId, string>(),
  };
  const groups: GroupAccess = {
    access: async (userId, publicId) => {
      const tier = state.participants.get(userId);
      if (tier === undefined || publicId !== PUBLIC_ID) throw appError('GROUP_NOT_FOUND');
      const permissions: GroupPermission[] = state.managers.has(userId) ? ['matches.manage'] : [];
      return { groupId: GROUP_ID, publicId: PUBLIC_ID, name: 'Pelada de sexta', tier, permissions };
    },
    participants: async () =>
      new Map(
        [...state.participants].map(([id, tier]) => [
          id,
          { tier, joinedAt: state.joinedAt.get(id) ?? JOINED_AT },
        ]),
      ),
    holders: async () => [...state.managers],
  };
  const users = {
    getMany: async (ids: readonly UserId[]): Promise<UserRecord[]> =>
      ids
        .filter((id) => pub[id] !== undefined && !state.noProfile.has(id))
        .map((id) => ({
          id,
          publicId: pub[id] as UserRecord['publicId'],
          nickname: (pub[id] as string).toLowerCase(),
          createdAt: '2026-01-01T00:00:00.000Z',
          version: 1,
        })),
    resolve: async (publicIds: readonly UserRecord['publicId'][]) =>
      new Map(
        Object.entries(pub)
          .filter(
            ([id, p]) =>
              publicIds.includes(p as UserRecord['publicId']) && !state.noProfile.has(id as UserId),
          )
          .map(([id, p]) => [p as UserRecord['publicId'], id as UserId]),
      ),
  };
  const notifications = {
    notify: async (userId: UserId, n: { type: string; link?: string }) => {
      sent.push({ userId, type: n.type, link: n.link });
    },
  };
  const service = createMatchService({
    matches: memoryMatches().repo,
    groups,
    users,
    notifications: notifications as never,
    now: () => clock.now,
  });
  const at = (when: string) => {
    clock.now = new Date(when);
  };
  return { service, clock, at, sent, state };
}
