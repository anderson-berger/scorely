import { appError } from '@scorely/api/src/lib/errors';
import type { UserId } from '@scorely/api/src/lib/ids';
import type {
  CompetitionRepository,
  StoredCompetition,
} from '@scorely/api/src/modules/competition/competition.repository';
import { competitionStatus } from '@scorely/api/src/modules/competition/competition.status';
import type { GroupRepository } from '@scorely/api/src/modules/groups/group.repository';
import {
  requireActive,
  requireMember,
  requireOwner,
  requirePermission,
} from '@scorely/api/src/modules/groups/groups.deps';
import {
  COMPETITION_PRESETS,
  COMPETITION_TRIAL_DAYS,
  type Competition,
  type UpdateCompetitionRulesInput,
} from '@scorely/contracts';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CompetitionDeps {
  groups: GroupRepository;
  competitions: CompetitionRepository;
  now?: () => Date;
}

export function createCompetitionService(deps: CompetitionDeps) {
  const now = deps.now ?? (() => new Date());

  /** CMP-05: o estado, o plano, a data e o regulamento (ausentes enquanto desativada). */
  function view(item: StoredCompetition | undefined): Competition {
    const status = competitionStatus(item, now());
    if (!item) return { status, trialAvailable: true };
    return {
      status,
      plan: item.plan,
      activeUntil: item.activeUntil,
      trialAvailable: false,
      rules: item.rules,
      // CMP-42: a versão que o regulamento manda.
      version: item.version,
    };
  }

  return {
    /** CMP-05: membros e reservas veem, inclusive vencida e com o grupo arquivado. */
    async get(userId: UserId, groupId: string): Promise<Competition> {
      await requireMember(deps, userId, groupId);
      return view(await deps.competitions.get(groupId));
    },

    /**
     * CMP-02: só o dono, uma vez por grupo, 30 dias com a Pelada clássica (CMP-08). A ordem dos erros é a da
     * GRP-52 (quem não participa, quem não é dono, arquivado) e só então o teste já usado.
     */
    async startTrial(userId: UserId, groupId: string): Promise<Competition> {
      const group = await requireOwner(deps, userId, groupId);
      requireActive(group);
      if (await deps.competitions.get(groupId)) throw appError('COMPETITION_TRIAL_USED');
      const at = now();
      const item: StoredCompetition = {
        groupId,
        plan: 'trial',
        activeUntil: new Date(at.getTime() + COMPETITION_TRIAL_DAYS * DAY_MS).toISOString(),
        trialStartedAt: at.toISOString(),
        rules: COMPETITION_PRESETS.classic,
        createdAt: at.toISOString(),
        updatedAt: at.toISOString(),
        version: 1,
      };
      // A condição no banco barra dois toques ao mesmo tempo (os dois leram "desativada").
      await deps.competitions.create(item);
      return view(item);
    },

    /**
     * CMP-07: `seasons.manage` troca o regulamento inteiro. Ordem: permissão, arquivado e só então a competição
     * desativada ou vencida (CMP-04), conferida também na gravação.
     */
    async updateRules(
      userId: UserId,
      groupId: string,
      input: UpdateCompetitionRulesInput,
    ): Promise<Competition> {
      const { version, ...rules } = input;
      const { group } = await requirePermission(deps, userId, groupId, 'seasons.manage');
      requireActive(group);
      const item = await deps.competitions.get(groupId);
      if (!item || competitionStatus(item, now()) !== 'active') throw appError('COMPETITION_INACTIVE');
      const at = now().toISOString();
      // CMP-42: só grava na versão que a tela mostrou.
      await deps.competitions.updateRules(groupId, rules, at, version);
      return view({ ...item, rules, updatedAt: at, version: version + 1 });
    },
  };
}
