import { authRoute } from '@scorely/api/src/lib/auth';
import { created, type HttpEvent, parseBody, pathParam } from '@scorely/api/src/lib/http';
import { asPublicGroupId } from '@scorely/api/src/lib/ids';
import { createCompetitionService } from '@scorely/api/src/modules/groups/competitions/competitions.service';
import { dynamoCompetitionRepository } from '@scorely/api/src/modules/groups/competitions/data/competitions.repository';
import { dynamoGroupRepository } from '@scorely/api/src/modules/groups/data/groups.repository';
import { createGroupAccess } from '@scorely/api/src/modules/groups/groups.access';
import { dynamoMatchRepository } from '@scorely/api/src/modules/groups/matches/data/matches.repository';
import { mediaService } from '@scorely/api/src/modules/media/media.service';
import { dynamoUserDirectory } from '@scorely/api/src/modules/users/data/users.repository';
import {
  type Competition,
  type CompetitionList,
  type CompetitionQuery,
  CompetitionQuerySchema,
  type CreateCompetitionInput,
  CreateCompetitionInputSchema,
  type UpdateCompetitionInput,
  UpdateCompetitionInputSchema,
} from '@scorely/contracts';

const competitions = createCompetitionService({
  competitions: dynamoCompetitionRepository,
  matches: dynamoMatchRepository,
  groups: createGroupAccess(dynamoGroupRepository),
  users: dynamoUserDirectory,
  media: mediaService,
});

const groupOf = (event: HttpEvent) => asPublicGroupId(pathParam(event, 'publicId'));
const competitionOf = (event: HttpEvent) => pathParam(event, 'competitionId');

export async function createCompetition(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input: CreateCompetitionInput = parseBody(event, CreateCompetitionInputSchema);
    const publicId = groupOf(event);
    const competition: Competition = await competitions.create(auth.userId, publicId, input);
    return created(competition);
  });
}

export async function listCompetitions(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const publicId = groupOf(event);
    const list: CompetitionList = await competitions.list(auth.userId, publicId);
    return list;
  });
}

export async function getCompetition(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const { cut }: CompetitionQuery = CompetitionQuerySchema.parse(event.queryStringParameters ?? {});
    const publicId = groupOf(event);
    const competitionId = competitionOf(event);
    const competition: Competition = await competitions.get(auth.userId, publicId, competitionId, cut);
    return competition;
  });
}

export async function updateCompetition(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input: UpdateCompetitionInput = parseBody(event, UpdateCompetitionInputSchema);
    const publicId = groupOf(event);
    const competitionId = competitionOf(event);
    const competition: Competition = await competitions.update(auth.userId, publicId, competitionId, input);
    return competition;
  });
}

export async function closeCompetition(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const publicId = groupOf(event);
    const competitionId = competitionOf(event);
    const competition: Competition = await competitions.close(auth.userId, publicId, competitionId);
    return competition;
  });
}

/** A rotina da trava (evento `schedule`, COM-11, ADR 0012): não é rota. */
export async function competitionsLock() {
  await competitions.runLock();
}
