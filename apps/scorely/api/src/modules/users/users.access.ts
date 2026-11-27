// O que os outros módulos usam dos usuários (ADR 0021): o perfil e a leitura dos perfis.
import type { UserId } from '@scorely/api/src/lib/ids';
import type { PublicUserId, User } from '@scorely/contracts';

/**
 * O perfil como fica no banco (`META`): `id` é o id do sistema, `publicId` o código de amigo (USR-15) e
 * `avatarMediaId` a mídia da foto (USR-08; a URL é montada na resposta, MID-12). Sem email nem nome (USR-13).
 * Interno da api: a resposta sai pelo `toMe`/`publicId`.
 */
export type UserRecord = Omit<User, 'id' | 'avatarUrl'> & {
  id: UserId;
  publicId: PublicUserId;
  avatarMediaId?: string;
  /** USR-18: a versão do perfil, que o `PATCH /me` manda (ADR 0013, 0016). */
  version: number;
};

/** O que outros módulos leem dos usuários (ex.: os perfis dos membros do grupo). Só o perfil: nunca o email (USR-13). */
export interface UserDirectory {
  get(id: UserId): Promise<UserRecord | undefined>;
  /** Vários de uma vez (BatchGet), na ordem dos ids; os que não existem somem. */
  getMany(ids: readonly UserId[]): Promise<UserRecord[]>;
  /** USR-17: ids públicos da entrada → ids do sistema; os desconhecidos ficam de fora. */
  resolve(publicIds: readonly PublicUserId[]): Promise<Map<PublicUserId, UserId>>;
}
