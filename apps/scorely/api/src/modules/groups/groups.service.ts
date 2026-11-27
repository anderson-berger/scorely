// As dependências do grupo. As regras ficam em rules/, uma por assunto, e o handler chama direto.
import type { UserId } from '@scorely/api/src/lib/ids';
import type { GroupRepository } from '@scorely/api/src/modules/groups/data/groups.repository';
import type { MediaService } from '@scorely/api/src/modules/media/media.service';
import type { NotificationService } from '@scorely/api/src/modules/notifications/notifications.service';
import type { UserDirectory } from '@scorely/api/src/modules/users/users.access';
import type { PublicGroupId } from '@scorely/contracts';

export {
  newPublicGroupId,
  toGroup,
  toUser,
  type UrlOf,
} from '@scorely/api/src/modules/groups/rules/groups';

export interface GroupsDeps {
  groups: GroupRepository;
  /** MID-12: só o `urlOf` da mídia. Sem ele, a mídia de produção. */
  media?: Pick<MediaService, 'urlOf'>;
  /** Perfis das pessoas (GRV-19, 29) e ids públicos → uuid (GRV-31). */
  users: Pick<UserDirectory, 'getMany' | 'resolve'>;
  /** A hora atual (`systemNow` em produção). */
  now: () => Date;
  newPublicId?: () => PublicGroupId;
  /** GRV-23: o email da conta (parte privada, USR-13) e a conta de um email. */
  emails: {
    emailOf(userId: UserId): Promise<string | undefined>;
    userIdOf(email: string): Promise<UserId | undefined>;
  };
  /** Os avisos `group_invited` (GRV-23), `group_join_requested` (GRV-27) e `group_join_approved` (GRV-28). */
  notifications: { notify(...args: Parameters<NotificationService['notify']>): Promise<unknown> };
  /** GRV-18: o token do link do convite. Padrão: 32 bytes aleatórios em base64url. */
  newToken?: () => string;
}

/** Logo e capa (GRV-09): o repositório, a mídia inteira (o envio e a troca do arquivo) e a hora. */
export interface GroupImagesDeps extends Pick<GroupsDeps, 'groups' | 'now'> {
  media: MediaService;
}
