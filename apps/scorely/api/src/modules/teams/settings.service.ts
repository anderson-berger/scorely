import { appError } from '@scorely/api/src/lib/errors';
import type { UserId } from '@scorely/api/src/lib/ids';
import type { GroupRepository, StoredGroup } from '@scorely/api/src/modules/groups/group.repository';
import { requireActive, requireMember } from '@scorely/api/src/modules/groups/groups.deps';
import type { TeamApartRule } from '@scorely/api/src/modules/teams/engine/rules';
import {
  canManageTeams,
  classifiablePeople,
  type TeamsDeps,
} from '@scorely/api/src/modules/teams/player.service';
import type {
  StoredTeamSettings,
  TeamSettingsRepository,
} from '@scorely/api/src/modules/teams/settings.repository';
import type { UserDirectory } from '@scorely/api/src/modules/users/user.repository';
import {
  type PublicUserId,
  SPORT_POSITIONS,
  type TeamSettings,
  type UpdateTeamSettingsInput,
} from '@scorely/contracts';

/**
 * A configuração que o sorteio e os times usam, com os opostos pelo id do sistema (interno). A resposta troca pelo
 * id público e acrescenta os nomes (`TeamSettings.names`, USR-16).
 */
export type TeamConfig = Omit<TeamSettings, 'names' | 'apart'> & { apart: TeamApartRule[] };

/** Sem nada salvo (TIM-17): 2 times, sem regras, sem opostos, não espalha, não permite publicar fora das regras. */
export const DEFAULT_TEAM_SETTINGS: TeamConfig = {
  teamCount: 2,
  rules: [],
  apart: [],
  spreadGender: false,
  allowOutsideRules: false,
};

/** O que a configuração salva vira (sem as chaves do item; item antigo sem opostos ou preferência = padrão). */
export function settingsOf(stored: StoredTeamSettings | undefined): TeamConfig {
  if (!stored) return DEFAULT_TEAM_SETTINGS;
  return {
    teamCount: stored.teamCount,
    rules: stored.rules,
    apart: stored.apart ?? [],
    spreadGender: stored.spreadGender ?? false,
    allowOutsideRules: stored.allowOutsideRules,
  };
}

export interface TeamSettingsDeps {
  groups: GroupRepository;
  /** Quem pode entrar em times opostos (TIM-22 = TIM-04). */
  roster: TeamsDeps['roster'];
  /** O nome e o id público de quem está nos times opostos, inclusive quem saiu do grupo; a tradução da entrada (USR-17). */
  users: Pick<UserDirectory, 'getMany' | 'resolve'>;
  settings: TeamSettingsRepository;
  now?: () => Date;
}

export function createTeamSettingsService(deps: TeamSettingsDeps) {
  const now = deps.now ?? (() => new Date());

  /** TIM-17: só o dono vê e muda (404 para quem não participa, 403 para quem não é dono). */
  async function requireManager(userId: UserId, groupId: string) {
    const { group } = await requireMember(deps, userId, groupId);
    if (!canManageTeams(group, userId)) throw appError('GROUP_NOT_OWNER');
    return group;
  }

  /** A resposta: os opostos pelo id público (USR-16), com o nome de cada pessoa (TIM-21, 22). */
  async function withNames(config: TeamConfig): Promise<TeamSettings> {
    const ids = [...new Set(config.apart.flatMap((r) => r.people))] as UserId[];
    const users = ids.length > 0 ? await deps.users.getMany(ids) : [];
    const publicIds = new Map<string, PublicUserId>(users.map((u) => [u.id, u.publicId]));
    const publicOf = (id: string): PublicUserId => {
      const found = publicIds.get(id);
      if (!found) throw new Error('Apart rule person without a user profile');
      return found;
    };
    const names = Object.fromEntries(users.flatMap((u) => (u.name ? [[u.publicId, u.name]] : [])));
    return { ...config, apart: config.apart.map((r) => ({ people: r.people.map(publicOf) })), names };
  }

  /** USR-17: os opostos chegam pelo id público; desconhecido → TEAM_PLAYER_NOT_FOUND, sem gravar. */
  async function internalApart(apart: UpdateTeamSettingsInput['apart']): Promise<TeamApartRule[]> {
    const rules = apart ?? [];
    const wanted = [...new Set(rules.flatMap((r) => r.people))] as PublicUserId[];
    const found = wanted.length > 0 ? await deps.users.resolve(wanted) : new Map<PublicUserId, UserId>();
    return rules.map((r) => ({
      people: r.people.map((id) => {
        const userId = found.get(id as PublicUserId);
        if (!userId) throw appError('TEAM_PLAYER_NOT_FOUND');
        return userId;
      }),
    }));
  }

  /**
   * TIM-22: cada pessoa dos opostos é alguém que o dono pode classificar (TIM-04), ou já estava numa regra salva
   * (quem saiu do grupo continua na regra). Senão, TEAM_PLAYER_NOT_FOUND.
   */
  async function checkApart(
    userId: UserId,
    group: StoredGroup,
    apart: TeamConfig['apart'],
    saved: TeamConfig['apart'],
  ): Promise<void> {
    const wanted = apart.flatMap((r) => r.people);
    if (wanted.length === 0) return;
    const allowed = new Set<string>([
      ...(await classifiablePeople(deps.roster, userId, group)).map((p) => p.userId),
      ...saved.flatMap((r) => r.people),
    ]);
    if (wanted.some((id) => !allowed.has(id))) throw appError('TEAM_PLAYER_NOT_FOUND');
  }

  return {
    /** TIM-17: a configuração do grupo, ou o padrão. */
    async get(userId: UserId, groupId: string): Promise<TeamSettings> {
      const group = await requireManager(userId, groupId);
      return withNames(settingsOf(await deps.settings.get(group.id)));
    },

    /**
     * TIM-17, 18, 22, 23: substitui a configuração inteira. Posição de outro esporte → TEAM_POSITION_INVALID; pessoa
     * de times opostos que o dono não pode classificar → TEAM_PLAYER_NOT_FOUND.
     */
    async update(userId: UserId, groupId: string, input: UpdateTeamSettingsInput): Promise<TeamSettings> {
      const group = await requireManager(userId, groupId);
      requireActive(group);
      const allowed = new Set<string>(SPORT_POSITIONS[group.sport]);
      const invalid = input.rules.find(
        (r) => r.target.kind === 'position' && !allowed.has(r.target.position),
      );
      if (invalid?.target.kind === 'position')
        throw appError('TEAM_POSITION_INVALID', { position: invalid.target.position });
      const existing = await deps.settings.get(group.id);
      const apart = await internalApart(input.apart);
      await checkApart(userId, group, apart, settingsOf(existing).apart);
      const at = now().toISOString();
      const stored: StoredTeamSettings = {
        groupId: group.id,
        teamCount: input.teamCount,
        rules: input.rules,
        apart,
        spreadGender: input.spreadGender ?? false,
        allowOutsideRules: input.allowOutsideRules,
        createdAt: existing?.createdAt ?? at,
        updatedAt: at,
      };
      await deps.settings.put(stored);
      return withNames(settingsOf(stored));
    },
  };
}
