import { newEntity } from '@scorely/api/src/lib/entity';
import { appError } from '@scorely/api/src/lib/errors';
import type { UserId } from '@scorely/api/src/lib/ids';
import { type MediaService, mediaService } from '@scorely/api/src/modules/media/media.service';
import type { MediaTarget } from '@scorely/api/src/modules/media/media.table';
import { newPublicId } from '@scorely/api/src/modules/users/public-id';
import type { MeRecord, UserRecord, UserRepository } from '@scorely/api/src/modules/users/user.repository';
import { userKey } from '@scorely/api/src/modules/users/user.table';
import type {
  AttachMediaInput,
  Me,
  MediaUpload,
  MediaUploadInput,
  Preferences,
  PublicUserId,
  UpdateMeInput,
} from '@scorely/contracts';

/** Quantas vezes sorteia o código de amigo quando ele já está em uso (USR-15). */
const PUBLIC_ID_ATTEMPTS = 3;

/**
 * USR-16: a pessoa como sai na resposta: `id` = id público, sem `publicId` nem `avatarMediaId`. A `avatarUrl` é
 * montada pelo id da mídia (MID-12): nenhum item guarda a URL. O `updatedAt` e a `version` são os do perfil (ADR 0013).
 */
export function toMe(record: MeRecord, urlOf: MediaService['urlOf']): Me {
  const { id: _id, publicId, avatarMediaId, ...rest } = record;
  return {
    id: publicId,
    ...rest,
    ...(avatarMediaId !== undefined && { avatarUrl: urlOf('avatar', avatarMediaId) }),
  };
}

export function createUserService(
  repo: UserRepository,
  now: () => Date = () => new Date(),
  media: MediaService = mediaService,
  newId: () => PublicUserId = newPublicId,
) {
  /** A própria pessoa: perfil, email e preferências (USR-13, 14). Conta sumida com token válido → 401 (AUTH-16). */
  async function getRecord(id: UserId): Promise<MeRecord> {
    const me = await repo.getMe(id);
    if (!me) throw appError('SESSION_INVALID');
    return me;
  }

  const show = (record: MeRecord): Me => toMe(record, media.urlOf);
  const get = async (id: UserId): Promise<Me> => show(await getRecord(id));

  /** Cria a conta; código de amigo em uso → sorteia outro (até `PUBLIC_ID_ATTEMPTS` no total). */
  async function create(email: string, attempt = 1): Promise<{ userId: UserId; me: Me; created: boolean }> {
    // USR-13: o email vai à parte, nunca no perfil. USR-15: o código nasce aqui e não muda mais.
    // USR-02: o apelido nasce igual ao código. `newEntity` gera o id do sistema (uuid) e o `createdAt`.
    const publicId = newId();
    const user = newEntity<UserRecord>({ publicId, nickname: publicId }, now());
    const result = await repo.create(user, email);
    if (result === 'created') {
      return { userId: user.id, me: show({ ...user, email, preferences: {} }), created: true };
    }
    if (result === 'public_id_taken') {
      if (attempt >= PUBLIC_ID_ATTEMPTS) throw appError('USER_CREATE_CONFLICT');
      return create(email, attempt + 1);
    }
    // Outro login criou o mesmo email ao mesmo tempo: relê o vencedor com leitura consistente,
    // senão a leitura eventual pode ainda não enxergar o item recém-gravado.
    const winner = await repo.getByEmail(email, { consistent: true });
    if (!winner) throw appError('USER_CREATE_CONFLICT');
    return { userId: winner.id, me: show(winner), created: false };
  }

  /** Onde a foto da pessoa fica ligada (MID-08): só o `avatarMediaId` no item dela (MID-12). */
  function avatarTarget(userId: UserId): MediaTarget {
    return {
      key: userKey(userId),
      field: 'avatar',
      async readCurrent() {
        const user = await repo.get(userId, { consistent: true });
        return user?.avatarMediaId;
      },
    };
  }

  return {
    get,

    /**
     * Acha o usuário pelo email (já normalizado) ou cria um novo.
     * Se dois logins simultâneos tentarem criar o mesmo email, o perdedor relê o vencedor.
     * `userId` é o id do sistema (sessão e JWT); `me` sai com o público (USR-16).
     */
    async findOrCreateByEmail(email: string): Promise<{ userId: UserId; me: Me; created: boolean }> {
      const existing = await repo.getByEmail(email);
      if (existing) return { userId: existing.id, me: show(existing), created: false };
      return create(email);
    },

    /** USR-03: cada campo vai para a sua parte (perfil, privado ou preferências); devolve a pessoa com as preferências (USR-14). */
    async update(id: UserId, patch: UpdateMeInput): Promise<Me> {
      // USR-03: o código é o apelido de quem ainda não escolheu (USR-02); confere antes de gravar qualquer campo.
      if (patch.nickname !== undefined) {
        const current = await repo.get(id);
        if (!current) throw appError('SESSION_INVALID');
        if (patch.nickname === current.publicId) throw appError('USER_NICKNAME_IS_PUBLIC_ID');
      }
      const me = await repo.update(id, patch);
      if (!me) throw appError('SESSION_INVALID');
      return show(me);
    },

    /** Preferências atuais (USR-14): o refresh devolve junto com os tokens. */
    preferences: (id: UserId): Promise<Preferences> => repo.getPreferences(id),

    /** USR-08: só a própria pessoa pede o envio da foto (dona e quem envia). */
    async requestAvatarUpload(userId: UserId, input: MediaUploadInput): Promise<MediaUpload> {
      await getRecord(userId);
      return media.requestUpload({
        purpose: 'avatar',
        ownerId: userId,
        uploadedBy: userId,
        contentType: input.contentType,
      });
    },

    /** USR-08: confirma a foto; a mídia confere, liga e apaga a anterior (MID-05 a MID-09). */
    async setAvatar(userId: UserId, input: AttachMediaInput): Promise<Me> {
      await get(userId);
      await media.attach({
        mediaId: input.mediaId,
        purpose: 'avatar',
        ownerId: userId,
        target: avatarTarget(userId),
      });
      return get(userId);
    },

    /** USR-08: remove a foto (MID-10). Sem foto, devolve o usuário como está. */
    async clearAvatar(userId: UserId): Promise<Me> {
      await get(userId);
      await media.detach({ purpose: 'avatar', ownerId: userId, target: avatarTarget(userId) });
      return get(userId);
    },
  };
}
export type UserService = ReturnType<typeof createUserService>;
