import { dynamoCompetitionRepository } from '@scorely/api/src/modules/competition/competition.repository';
import { dynamoMatchRepository } from '@scorely/api/src/modules/competition/match.repository';
import { dynamoResultRepository } from '@scorely/api/src/modules/competition/result.repository';
import {
  createSeasonLockJob,
  dynamoSeasonLockRepository,
} from '@scorely/api/src/modules/competition/season.lock';
import { dynamoSeasonRepository } from '@scorely/api/src/modules/competition/season.repository';
import { dynamoTrophyRepository } from '@scorely/api/src/modules/competition/trophy.repository';
import { dynamoGroupRepository } from '@scorely/api/src/modules/groups/group.repository';
import { dynamoNotificationRepository } from '@scorely/api/src/modules/notifications/notification.repository';
import { createNotificationService } from '@scorely/api/src/modules/notifications/notification.service';
import { dynamoUserDirectory } from '@scorely/api/src/modules/users/user.repository';

// Tarefas periódicas da competição (ADR 0012): não são rotas, então não passam por route()/authRoute().

const lock = createSeasonLockJob({
  groups: dynamoGroupRepository,
  competitions: dynamoCompetitionRepository,
  seasons: dynamoSeasonRepository,
  results: dynamoResultRepository,
  matches: dynamoMatchRepository,
  users: dynamoUserDirectory,
  notifications: createNotificationService(dynamoNotificationRepository),
  trophies: dynamoTrophyRepository,
  locks: dynamoSeasonLockRepository,
});

/** CMP-39: uma vez por dia, trava as temporadas cujo prazo passou (com o ranking final, os troféus e os avisos). */
export async function lockSeasons() {
  const locked = await lock.run();
  console.log(JSON.stringify({ job: 'competition.lockSeasons', locked }));
  return { locked };
}
