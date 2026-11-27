import { appError } from '@scorely/api/src/lib/errors';
import type { GroupId } from '@scorely/api/src/lib/ids';
import {
  type CompetitionRepository,
  dynamoCompetitionRepository,
  type StoredCompetition,
} from '@scorely/api/src/modules/groups/competitions/data/competitions.repository';
import { createCompetitionRules } from '@scorely/api/src/modules/groups/competitions/rules/competitions';
import { createCountingRules } from '@scorely/api/src/modules/groups/competitions/rules/counting';
import { createRankingRules } from '@scorely/api/src/modules/groups/competitions/rules/ranking';
import type { GroupAccess } from '@scorely/api/src/modules/groups/groups.access';
import type { UrlOf } from '@scorely/api/src/modules/groups/groups.service';
import type { MatchRepository } from '@scorely/api/src/modules/groups/matches/data/matches.repository';
import { type MediaService, mediaService } from '@scorely/api/src/modules/media/media.service';
import type { UserDirectory } from '@scorely/api/src/modules/users/users.access';
import type { GroupPermission } from '@scorely/contracts';

// Competição (docs/modules/competicao.md): a temporada que soma os resultados das partidas que valem para ela.
// O service só junta os assuntos (ADR 0021): criar, editar e encerrar; quais partidas contam; o ranking.

export interface CompetitionsDeps {
  competitions?: CompetitionRepository;
  /** As repetições e as partidas (COM-01) e as partidas do período com o resultado (COM-05). */
  matches: Pick<MatchRepository, 'getSeries' | 'getMatch' | 'listByEnd'>;
  /** Participação e permissão (GRV-15, 17); os membros de agora disputam (COM-06). */
  groups: Pick<GroupAccess, 'access' | 'participants'>;
  /** Os perfis do ranking e o gênero dos recortes (COM-08). */
  users: Pick<UserDirectory, 'getMany'>;
  media?: Pick<MediaService, 'urlOf'>;
  now?: () => Date;
}

export type Access = Awaited<ReturnType<GroupAccess['access']>>;

const MANAGE: GroupPermission = 'competitions.manage';

/** O que os assuntos (`rules/`) compartilham: as deps prontas, o relógio e o acesso. */
function competitionContext(deps: CompetitionsDeps) {
  const repo = deps.competitions ?? dynamoCompetitionRepository;
  const urlOf: UrlOf = (purpose, mediaId) =>
    deps.media ? deps.media.urlOf(purpose, mediaId) : mediaService.urlOf(purpose, mediaId);
  const canManage = (ctx: Access) => ctx.permissions.includes(MANAGE);

  function requireManage(ctx: Access): void {
    if (!canManage(ctx)) throw appError('GROUP_PERMISSION_DENIED', { permission: MANAGE });
  }

  async function load(groupId: GroupId, id: string, consistent = false): Promise<StoredCompetition> {
    const c = await repo.getCompetition(groupId, id, { consistent });
    if (!c) throw appError('COMPETITION_NOT_FOUND');
    return c;
  }

  return { deps, now: deps.now ?? (() => new Date()), repo, urlOf, canManage, requireManage, load };
}

export type CompetitionContext = ReturnType<typeof competitionContext>;

export function createCompetitionService(deps: CompetitionsDeps) {
  const ctx = competitionContext(deps);
  const counting = createCountingRules(ctx);
  const ranking = createRankingRules(ctx, counting);
  const { create, list, get, update, close, runLock } = createCompetitionRules(ctx, counting, ranking);
  return { create, list, get, update, close, runLock };
}

export type CompetitionService = ReturnType<typeof createCompetitionService>;
