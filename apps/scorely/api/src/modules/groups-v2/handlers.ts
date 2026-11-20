import { authRoute } from '@scorely/api/src/lib/auth';
import { created, type HttpEvent, parseBody, pathParam } from '@scorely/api/src/lib/http';
import { asPublicGroupId } from '@scorely/api/src/lib/ids';
import { dynamoGroupV2Repository } from '@scorely/api/src/modules/groups-v2/group-v2.repository';
import { createGroupV2Service } from '@scorely/api/src/modules/groups-v2/group-v2.service';
import { CreateGroupV2InputSchema } from '@scorely/contracts';

const groups = createGroupV2Service({ groups: dynamoGroupV2Repository });

export async function createGroupV2(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    return created(await groups.create(auth.userId, parseBody(event, CreateGroupV2InputSchema)));
  });
}

export async function getGroupV2(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const group = await groups.get(auth.userId, asPublicGroupId(pathParam(event, 'publicId')));
    return group;
  });
}

export async function myGroupsV2(event: HttpEvent) {
  return authRoute(event, async (auth) => {
    const list = await groups.mine(auth.userId);
    return list;
  });
}
