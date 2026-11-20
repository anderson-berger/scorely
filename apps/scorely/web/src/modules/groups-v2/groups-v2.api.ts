import { type CreateGroupV2Input, GroupV2Schema } from '@scorely/contracts';
import { request } from '@scorely/web/src/lib/http';

/** Grupo v2 (docs/modules/grupos-v2.md): rotas em `/v2`, o grupo sempre pelo id público (GRV-08). */
export const groupsV2Api = {
  create: (input: CreateGroupV2Input) =>
    request({ url: '/v2/groups', method: 'POST', data: input }, GroupV2Schema),
  mine: () => request({ url: '/v2/me/groups' }, GroupV2Schema.array()),
  get: (id: string) => request({ url: `/v2/groups/${encodeURIComponent(id)}` }, GroupV2Schema),
};
