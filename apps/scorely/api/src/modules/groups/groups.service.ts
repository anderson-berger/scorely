// O service do grupo: junta os assuntos de rules/ (ADR 0021) sobre um contexto comum.
import type { UserId } from '@scorely/api/src/lib/ids';
import type { GroupRepository } from '@scorely/api/src/modules/groups/data/groups.repository';
import { groupContext, groupRules } from '@scorely/api/src/modules/groups/rules/groups';
import { inviteRules } from '@scorely/api/src/modules/groups/rules/invites';
import { memberRules } from '@scorely/api/src/modules/groups/rules/members';
import { openRules } from '@scorely/api/src/modules/groups/rules/open';
import { roleRules } from '@scorely/api/src/modules/groups/rules/roles';
import type { MediaService } from '@scorely/api/src/modules/media/media.service';
import type { NotificationService } from '@scorely/api/src/modules/notifications/notifications.service';
import type { UserDirectory } from '@scorely/api/src/modules/users/users.access';
import type { PublicGroupId } from '@scorely/contracts';

export {
  forViewer,
  newPublicGroupId,
  toUser,
  type UrlOf,
} from '@scorely/api/src/modules/groups/rules/groups';

export interface GroupsDeps {
  groups: GroupRepository;
  /** MID-12: só o `urlOf` da mídia. Sem ele, a mídia de produção. */
  media?: Pick<MediaService, 'urlOf'>;
  /** Perfis das pessoas (GRV-19, 29) e ids públicos → uuid (GRV-31). */
  users: Pick<UserDirectory, 'getMany' | 'resolve'>;
  now?: () => Date;
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

export function createGroupService(deps: GroupsDeps) {
  const ctx = groupContext(deps);
  return {
    ...roleRules(ctx),
    ...groupRules(ctx),
    ...inviteRules(ctx),
    ...memberRules(ctx),
    ...openRules(ctx),
  };
}
