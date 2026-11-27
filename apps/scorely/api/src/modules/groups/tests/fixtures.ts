// O setup dos testes do grupo (ADR 0021): as pessoas, os fakes das deps, o relógio e o service pronto em memória.
import type { AppError } from '@scorely/api/src/lib/errors';
import { asPublicUserId, asUserId, type UserId } from '@scorely/api/src/lib/ids';
import { memoryGroups } from '@scorely/api/src/modules/groups/data/groups.memory';
import type { GroupRepository } from '@scorely/api/src/modules/groups/data/groups.repository';
import { createGroupService, type GroupsDeps } from '@scorely/api/src/modules/groups/groups.service';
import type { UserRecord } from '@scorely/api/src/modules/users/users.access';
import type { PublicGroupId } from '@scorely/contracts';

export const ANA = asUserId('11111111-1111-4111-8111-111111111111');
export const BIA = asUserId('22222222-2222-4222-8222-222222222222');
export const CAIO = asUserId('33333333-3333-4333-8333-333333333333');
export const DUDA = asUserId('44444444-4444-4444-8444-444444444444');

/** O id público (USR-15) e o apelido de cada pessoa do teste. */
export const PUBLIC = {
  [ANA]: asPublicUserId('1AAAAAAA'),
  [BIA]: asPublicUserId('2BBBBBBB'),
  [CAIO]: asPublicUserId('3CCCCCCC'),
  [DUDA]: asPublicUserId('4DDDDDDD'),
} as Record<string, ReturnType<typeof asPublicUserId>>;
export const NICK = { [ANA]: 'ana', [BIA]: 'bia', [CAIO]: 'caio', [DUDA]: 'duda' } as Record<string, string>;

/** Fakes das deps que o teste não usa: nenhuma conta tem email (GRV-23) e nenhum aviso sai. */
export const noEmails: GroupsDeps['emails'] = {
  emailOf: async () => undefined,
  userIdOf: async () => undefined,
};
export const noNotifications: GroupsDeps['notifications'] = { notify: async () => undefined };

export function pid(code: string): PublicGroupId {
  return code as PublicGroupId;
}

/** O erro da promessa (ou `undefined` se ela resolveu). */
export async function errorOf(p: Promise<unknown>) {
  return (await p.then(
    () => undefined,
    (e: unknown) => e,
  )) as AppError | undefined;
}

/** Só o código do erro da promessa. */
export async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (err) {
    return (err as { code?: string }).code;
  }
}

/** Diretório só com as pessoas de `PUBLIC`: quem não está lá não tem perfil nem id público. */
export function knownUsers(): GroupsDeps['users'] {
  return {
    getMany: async (ids: readonly UserId[]): Promise<UserRecord[]> =>
      ids
        .filter((id) => PUBLIC[id] !== undefined)
        .map((id) => ({
          id,
          publicId: PUBLIC[id] as UserRecord['publicId'],
          nickname: NICK[id] ?? 'x',
          createdAt: '2026-01-01T00:00:00.000Z',
          version: 1,
        })),
    resolve: async (publicIds: readonly UserRecord['publicId'][]) =>
      new Map(
        Object.entries(PUBLIC)
          .filter(([, p]) => publicIds.includes(p))
          .map(([id, p]) => [p, id as UserId] as const),
      ),
  };
}

export interface Notified {
  userId: UserId;
  input: { type: string; title?: string; body?: string; link?: string };
}

export interface SetupOptions {
  /** O relógio começa aqui; o teste avança por `clock.now`. */
  now: Date;
  /** Padrão: `knownUsers()`. */
  users?: GroupsDeps['users'];
  /** Padrão: `noEmails`. */
  emails?: GroupsDeps['emails'];
  /** Troca o repositório (ex.: simular a corrida de uma gravação). */
  wrap?: ((repo: GroupRepository) => GroupRepository) | undefined;
  /** Padrão: `token-1`, `token-2`, ... */
  newToken?: () => string;
}

/** Memória, relógio, avisos gravados em `notified` e o service do grupo com o código `K3X9PQ2A`. */
export function setupGroups(opts: SetupOptions) {
  const mem = memoryGroups();
  const clock = { now: opts.now };
  const seq = { n: 0 };
  const notified: Notified[] = [];
  const service = createGroupService({
    groups: opts.wrap ? opts.wrap(mem.repo) : mem.repo,
    users: opts.users ?? knownUsers(),
    emails: opts.emails ?? noEmails,
    notifications: {
      notify: async (userId: UserId, input: Notified['input']) => {
        notified.push({ userId, input });
      },
    } as unknown as GroupsDeps['notifications'],
    now: () => clock.now,
    newPublicId: () => pid('K3X9PQ2A'),
    newToken:
      opts.newToken ??
      (() => {
        seq.n += 1;
        return `token-${seq.n}`;
      }),
  });
  return { ...mem, clock, service, notified };
}
