import { appError } from '@scorely/api/src/lib/errors';
import type { UserId } from '@scorely/api/src/lib/ids';
import type { GroupRepository, StoredGroup } from '@scorely/api/src/modules/groups/group.repository';
import { requireActive, requirePermission } from '@scorely/api/src/modules/groups/groups.deps';
import type { SportService } from '@scorely/api/src/modules/sports/sport.service';
import type { TeamApartRule } from '@scorely/api/src/modules/teams/engine/rules';
import { classifiablePeople, type TeamsDeps } from '@scorely/api/src/modules/teams/player.service';
import { positionsOf } from '@scorely/api/src/modules/teams/positions';
import type {
  StoredTeamSettings,
  TeamSettingsRepository,
} from '@scorely/api/src/modules/teams/settings.repository';
import type { UserDirectory } from '@scorely/api/src/modules/users/user.repository';
import type { PublicUserId, TeamRule, TeamSettings, UpdateTeamSettingsInput } from '@scorely/contracts';

/**
 * A configuração que o sorteio e os times usam, com os opostos pelo id do sistema (interno). A resposta troca pelo
 * id público e acrescenta os apelidos (`TeamSettings.nicknames`, USR-04, 16).
 */
export type TeamConfig = Omit<TeamSettings, 'nicknames' | 'apart'> & { apart: TeamApartRule[] };

/** Sem nada salvo (TIM-17): 2 times, sem regras, sem opostos, não espalha, não permite publicar fora das regras. */
export const DEFAULT_TEAM_SETTINGS: TeamConfig = {
  // TIM-25: sem item, a versão é 0 (o 1º PUT manda 0).
  version: 0,
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
    version: stored.version,
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
  /** TIM-18: as posições das regras vêm do catálogo do esporte do grupo (TIM-02). */
  sports: Pick<SportService, 'get'>;
  now?: () => Date;
}

export function createTeamSettingsService(deps: TeamSettingsDeps) {
  const now = deps.now ?? (() => new Date());

  /** TIM-17: só quem tem `teams.manage` vê e muda (404 para quem não participa, 403 para quem não tem). */
  async function requireManager(userId: UserId, groupId: string) {
    return (await requirePermission(deps, userId, groupId, 'teams.manage')).group;
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
    const nicknames = Object.fromEntries(users.map((u) => [u.publicId, u.nickname]));
    return { ...config, apart: config.apart.map((r) => ({ people: r.people.map(publicOf) })), nicknames };
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
      const existing = await deps.settings.get(group.id);
      // TIM-18, ESP-05: a posição desativada só continua numa regra que já existia.
      const ruled = (rules: readonly TeamRule[]) =>
        rules.flatMap((r) => (r.target.kind === 'position' ? [r.target.position] : []));
      const invalid = (await positionsOf(deps.sports, group.sportId)).invalid(
        ruled(input.rules),
        ruled(settingsOf(existing).rules),
      );
      if (invalid) throw appError('TEAM_POSITION_INVALID', { position: invalid });
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
        // TIM-25: grava só na versão que a tela mostrou; a nova é a seguinte.
        version: input.version + 1,
      };
      await deps.settings.put(stored, input.version);
      return withNames(settingsOf(stored));
    },
  };
}
