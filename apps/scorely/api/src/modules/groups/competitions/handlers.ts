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
  CompetitionQuerySchema,
  CreateCompetitionInputSchema,
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
    const input = parseBody(event, CreateCompetitionInputSchema);
    return created(await competitions.create(auth.userId, groupOf(event), input));
  });
}

export async function listCompetitions(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const list = await competitions.list(auth.userId, groupOf(event));
    return list;
  });
}

export async function getCompetition(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const { cut } = CompetitionQuerySchema.parse(event.queryStringParameters ?? {});
    const competition = await competitions.get(auth.userId, groupOf(event), competitionOf(event), cut);
    return competition;
  });
}

export async function updateCompetition(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const input = parseBody(event, UpdateCompetitionInputSchema);
    const competition = await competitions.update(auth.userId, groupOf(event), competitionOf(event), input);
    return competition;
  });
}

export async function closeCompetition(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const competition = await competitions.close(auth.userId, groupOf(event), competitionOf(event));
    return competition;
  });
}

/** A rotina da trava (evento `schedule`, COM-11, ADR 0012): não é rota. */
export async function competitionsLock() {
  await competitions.runLock();
}
