import { randomUUID } from 'node:crypto';
import { appError } from '@scorely/api/src/lib/errors';
import { asUserId, type UserId } from '@scorely/api/src/lib/ids';
import type { MeRecord, UserRepository } from '@scorely/api/src/modules/users/data/users.repository';
import { userKey } from '@scorely/api/src/modules/users/data/users.table';
import type { UserDirectory, UserRecord } from '@scorely/api/src/modules/users/users.access';
import type { Preferences } from '@scorely/contracts';

/**
 * Repositório e diretório de usuários em memória, para os testes de service e para a suíte de contrato
 * (usuarios.md, seção 3): perfil (`META`, com `publicId`, `nickname` e `version`), parte privada (`PRIVATE`: email e
 * nome, USR-13), preferências e os dois lookups (email e id público). Grava como o banco: o que o `create` recebe
 * fica como veio, e o `update` confere a `version` do perfil (USR-18, ADR 0016).
 *
 * `takenPublicIds` são códigos já em uso por outra conta (USR-15). `created` guarda o que cada `create` recebeu e
 * `writes` conta os `update` gravados (para conferir "nada gravado").
 */
export function memoryUsers(opts: { takenPublicIds?: readonly string[] } = {}) {
  const profiles = new Map<UserId, UserRecord>();
  const privates = new Map<UserId, { email: string; name?: string }>();
  const prefs = new Map<UserId, Preferences>();
  const publicIds = new Map<string, UserId>(
    (opts.takenPublicIds ?? []).map((code) => [code, asUserId(randomUUID())]),
  );
  const created: { user: UserRecord; email: string }[] = [];
  const writes = { count: 0 };
  const me = (id: UserId): MeRecord | undefined => {
    const profile = profiles.get(id);
    const priv = privates.get(id);
    if (!profile || priv === undefined) return undefined;
    return structuredClone({ ...profile, private: priv, preferences: prefs.get(id) ?? {} });
  };
  const idOf = (email: string) => [...privates.entries()].find(([, p]) => p.email === email)?.[0];
  /** Copia só os campos definidos (o patch não tem `null`, como o `SET` do banco). */
  const assign = (target: object, part: object | undefined) =>
    Object.assign(target, Object.fromEntries(Object.entries(part ?? {}).filter(([, v]) => v !== undefined)));
  const resolve: UserRepository['resolve'] = async (codes) =>
    new Map(
      [...new Set(codes)].flatMap((code) => {
        const id = publicIds.get(code);
        return id === undefined ? [] : [[code, id] as const];
      }),
    );
  const repo: UserRepository = {
    get: async (id) => structuredClone(profiles.get(id)),
    getMe: async (id) => me(id),
    getByEmail: async (email) => {
      const id = idOf(email);
      return id === undefined ? undefined : me(id);
    },
    getPreferences: async (id) => structuredClone(prefs.get(id) ?? {}),
    async create(user, email) {
      created.push(structuredClone({ user, email }));
      if (idOf(email) !== undefined) return 'email_taken';
      if (publicIds.has(user.publicId)) return 'public_id_taken';
      profiles.set(user.id, structuredClone(user));
      privates.set(user.id, { email });
      prefs.set(user.id, {});
      publicIds.set(user.publicId, user.id);
      return 'created';
    },
    /** USR-18: condicionado na `version` do META, que soma 1 em toda mudança, mesmo só no privado ou nas preferências. */
    async update(id, patch) {
      const profile = profiles.get(id);
      const priv = privates.get(id);
      if (!profile || !priv) return undefined;
      if (profile.version !== patch.version)
        throw appError('VERSION_CONFLICT', { currentVersion: profile.version });
      const { private: privatePatch, preferences, version: _version, ...rest } = patch;
      writes.count += 1;
      profile.version += 1;
      assign(prefs.get(id) ?? {}, preferences);
      assign(priv, privatePatch);
      assign(profile, rest);
      return me(id);
    },
    resolve,
  };
  /** O perfil sem email nem nome, como os outros módulos leem (USR-13). */
  const directory: UserDirectory = {
    get: (id) => repo.get(id),
    getMany: async (ids) =>
      [...new Set(ids)].flatMap((id) =>
        profiles.has(id) ? [structuredClone(profiles.get(id) as UserRecord)] : [],
      ),
    resolve,
  };
  /** USR-18: a versão do perfil que a tela mostrou (`0` sem conta). */
  const v = (id: UserId) => ({ version: profiles.get(id)?.version ?? 0 });
  /**
   * O que a transação da mídia grava no item do usuário (`key` = `userKey(id)`): só o id (MID-12).
   * Soma 1 na `version`, como o `touch` do `attach`/`detach` no Dynamo (USR-18, ADR 0013).
   */
  const link = (key: { PK: string; SK: string }, mediaId: string | null) => {
    const user = [...profiles.values()].find((u) => userKey(u.id).PK === key.PK && key.SK === 'META');
    if (!user) throw new Error('user not found in memory store');
    if (mediaId) user.avatarMediaId = mediaId;
    else delete user.avatarMediaId;
    user.version += 1;
  };
  /** O id do sistema de um email: é ele que vai no JWT (USR-16), e o `user` do login só tem o público. */
  const systemIdOf = (email: string): UserId => {
    const id = idOf(email);
    if (id === undefined) throw new Error('no user for email in memory store');
    return id;
  };
  return { repo, directory, profiles, privates, prefs, created, writes, v, link, systemIdOf };
}
