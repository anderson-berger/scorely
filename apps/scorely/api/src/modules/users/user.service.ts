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

/** USR-16: a pessoa como sai na resposta: `id` = id público, sem `publicId` nem `avatarMediaId`. */
export function toMe(record: MeRecord): Me {
  const { id: _id, publicId, avatarMediaId: _media, ...rest } = record;
  return { id: publicId, ...rest };
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

  const get = async (id: UserId): Promise<Me> => toMe(await getRecord(id));

  /** Cria a conta; código de amigo em uso → sorteia outro (até `PUBLIC_ID_ATTEMPTS` no total). */
  async function create(email: string, attempt = 1): Promise<{ userId: UserId; me: Me; created: boolean }> {
    // USR-13: o email vai à parte, nunca no perfil. USR-15: o código nasce aqui e não muda mais.
    // `newEntity` gera o id do sistema (uuid) e o `createdAt`.
    const user = newEntity<UserRecord>({ publicId: newId() }, now());
    const result = await repo.create(user, email);
    if (result === 'created') {
      return { userId: user.id, me: toMe({ ...user, email, preferences: {} }), created: true };
    }
    if (result === 'public_id_taken') {
      if (attempt >= PUBLIC_ID_ATTEMPTS) throw appError('USER_CREATE_CONFLICT');
      return create(email, attempt + 1);
    }
    // Outro login criou o mesmo email ao mesmo tempo: relê o vencedor com leitura consistente,
    // senão a leitura eventual pode ainda não enxergar o item recém-gravado.
    const winner = await repo.getByEmail(email, { consistent: true });
    if (!winner) throw appError('USER_CREATE_CONFLICT');
    return { userId: winner.id, me: toMe(winner), created: false };
  }

  /** Onde a foto da pessoa fica ligada (MID-08): `avatarMediaId`/`avatarUrl` no item dela. */
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
      if (existing) return { userId: existing.id, me: toMe(existing), created: false };
      return create(email);
    },

    /** USR-03: cada campo vai para a sua parte (perfil ou preferências); devolve a pessoa com as preferências (USR-14). */
    async update(id: UserId, patch: UpdateMeInput): Promise<Me> {
      const me = await repo.update(id, patch);
      if (!me) throw appError('SESSION_INVALID');
      return toMe(me);
    },

    /** Preferências atuais (USR-14): o refresh devolve junto com os tokens. */
    preferences: (id: UserId): Promise<Preferences> => repo.getPreferences(id),

    /** USR-08: só a própria pessoa pede o envio da foto (dona e quem envia). */
    async requestAvatarUpload(userId: UserId, input: MediaUploadInput): Promise<MediaUpload> {
      const me = await getRecord(userId);
      return media.requestUpload({
        purpose: 'avatar',
        ownerId: userId,
        // USR-16, MID-12: o caminho público da foto leva o código de amigo, nunca o id do sistema.
        ownerRef: me.publicId,
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
