// Criar, modalidade, identificação e ver o grupo (GRV-01–05, 08, 52), e o que os outros assuntos usam em comum.
import { randomInt } from 'node:crypto';
import { newEntity } from '@scorely/api/src/lib/entity';
import { appError } from '@scorely/api/src/lib/errors';
import { range } from '@scorely/api/src/lib/fn';
import type { UserId } from '@scorely/api/src/lib/ids';
import type { StoredGroup, StoredMembership } from '@scorely/api/src/modules/groups/data/groups.repository';
import type { GroupsDeps } from '@scorely/api/src/modules/groups/groups.service';
import {
  type GroupRoles,
  permissionsOf,
  requirePermission,
  roleRefOf,
} from '@scorely/api/src/modules/groups/rules/permissions';
import { type MediaService, mediaService } from '@scorely/api/src/modules/media/media.service';
import type { UserRecord } from '@scorely/api/src/modules/users/users.access';
import {
  type CreateGroupInput,
  type Group,
  PUBLIC_GROUP_ID_LENGTH,
  PUBLIC_USER_ID_ALPHABET,
  type PublicGroupId,
  type SetGroupModalityInput,
  type User,
} from '@scorely/contracts';

/** MID-12: monta a URL pública pela finalidade e o id da mídia. */
export type UrlOf = MediaService['urlOf'];
const productionUrlOf: UrlOf = (purpose, mediaId) => mediaService.urlOf(purpose, mediaId);

/** GRV-08: um código em uso (chance desprezível) sorteia outro, até 3 vezes (como o id público do usuário). */
const PUBLIC_ID_ATTEMPTS = 3;

/** GRV-02: o grupo recém-criado só tem os cargos fixos. */
const NO_ROLES: GroupRoles = { roles: [], everyonePermissions: [] };

/** GRV-02: quem cria é membro com o cargo Dono. */
const OWNER: Pick<StoredMembership, 'role' | 'tier'> = { role: 'owner', tier: 'member' };

/** GRV-05: ordem de nome sem diferenciar maiúsculas e acentos. */
const byName = new Intl.Collator('pt-BR', { sensitivity: 'base' });

/** GRV-08: código do grupo com 8 caracteres sorteados (uniforme) do alfabeto Crockford base32 (o do usuário). */
export function newPublicGroupId(random: (max: number) => number = randomInt): PublicGroupId {
  return Array.from(
    { length: PUBLIC_GROUP_ID_LENGTH },
    () => PUBLIC_USER_ID_ALPHABET[random(PUBLIC_USER_ID_ALPHABET.length)],
  ).join('') as PublicGroupId;
}

/** USR-16: o perfil da pessoa como sai na resposta (id público, sem email nem nome). */
export function toUser(record: UserRecord, urlOf: UrlOf): User {
  return {
    id: record.publicId,
    createdAt: record.createdAt,
    nickname: record.nickname,
    ...(record.gender !== undefined && { gender: record.gender }),
    ...(record.avatarMediaId !== undefined && { avatarUrl: urlOf('avatar', record.avatarMediaId) }),
  };
}

/** O grupo como sai na resposta, para quem pede: o id público no lugar do uuid (GRV-08), o papel (GRV-04) e as URLs das imagens (GRV-10). */
export function toGroup(
  deps: Pick<GroupsDeps, 'media'>,
  group: StoredGroup,
  membership: Pick<StoredMembership, 'role' | 'tier'>,
  roles: GroupRoles,
): Group {
  const urlOf = mediaUrlOf(deps);
  return {
    id: group.publicId,
    createdAt: group.createdAt,
    version: group.version,
    name: group.name,
    myTier: membership.tier,
    myRole: roleRefOf(membership, roles),
    myPermissions: permissionsOf(membership, roles),
    joinMode: group.joinMode,
    modality: group.modality,
    ...(group.logoMediaId !== undefined && { logoUrl: urlOf('group.logo', group.logoMediaId) }),
    ...(group.coverMediaId !== undefined && { coverUrl: urlOf('group.cover', group.coverMediaId) }),
  };
}

/** MID-12: a URL pública pelas deps; sem mídia nas deps, a de produção. */
export function mediaUrlOf(deps: Pick<GroupsDeps, 'media'>): UrlOf {
  return (purpose, mediaId) => (deps.media?.urlOf ?? productionUrlOf)(purpose, mediaId);
}

/** Quem participa e o grupo; senão `GROUP_NOT_FOUND` (GRV-04, 15). */
export async function requireMembership(deps: GroupsDeps, userId: UserId, publicId: PublicGroupId) {
  const id = await deps.groups.resolve(publicId);
  if (id === undefined) throw appError('GROUP_NOT_FOUND');
  const [group, membership, roles] = await Promise.all([
    deps.groups.get(id),
    deps.groups.getMembership(id, userId),
    deps.groups.getRoles(id),
  ]);
  if (!group || !membership) throw appError('GROUP_NOT_FOUND');
  return { id, group, membership, roles };
}

/** Perfis de uma vez (`getMany`). */
export async function loadProfiles(deps: GroupsDeps, ids: readonly UserId[]): Promise<Map<UserId, User>> {
  const unique = [...new Set(ids)];
  const records = unique.length > 0 ? await deps.users.getMany(unique) : [];
  const urlOf = mediaUrlOf(deps);
  return new Map(records.map((r) => [r.id, toUser(r, urlOf)]));
}

export function profileOf(map: Map<UserId, User>, id: UserId): User {
  const user = map.get(id);
  if (!user) throw new Error('Group participant without a user profile');
  return user;
}

/** GRV-01, 02, 03: quem cria é o dono. */
export async function createGroup(deps: GroupsDeps, userId: UserId, input: CreateGroupInput): Promise<Group> {
  const group = await insertGroup(deps, userId, input.name);
  return toGroup(deps, group, OWNER, NO_ROLES);
}

/** GRV-08: grava o grupo; código em uso → sorteia outro, até `PUBLIC_ID_ATTEMPTS` vezes. */
async function insertGroup(deps: GroupsDeps, userId: UserId, name: string): Promise<StoredGroup> {
  for (const _ of range(PUBLIC_ID_ATTEMPTS)) {
    const group = newGroup(deps, name);
    const result = await deps.groups.create(group, userId);
    if (result === 'created') return group;
  }
  throw new Error('Could not allocate a group public id');
}

/** GRV-02: o grupo novo, no modo de convite e misto. O `updatedAt` nasce igual ao `createdAt` (ADR 0013). */
function newGroup(deps: GroupsDeps, name: string): StoredGroup {
  const publicId = deps.newPublicId?.() ?? newPublicGroupId();
  const entity = newEntity<Omit<StoredGroup, 'updatedAt'>>(
    { publicId, name, joinMode: 'invite', modality: 'mixed', version: 1 },
    deps.now(),
  );
  return { ...entity, updatedAt: entity.createdAt };
}

/** GRV-04: quem não participa, ou um código que não existe, recebe `GROUP_NOT_FOUND`. */
export async function getGroup(deps: GroupsDeps, userId: UserId, publicId: PublicGroupId): Promise<Group> {
  const { group, membership, roles } = await requireMembership(deps, userId, publicId);
  return toGroup(deps, group, membership, roles);
}

/** GRV-05: os grupos de que a pessoa participa, por nome. */
export async function listMyGroups(deps: GroupsDeps, userId: UserId): Promise<Group[]> {
  const rows = await deps.groups.listMine(userId);
  const roles = await Promise.all(rows.map(({ group }) => deps.groups.getRoles(group.id)));
  return rows
    .map(({ group, membership }, i) => toGroup(deps, group, membership, roles[i] as GroupRoles))
    .sort((a, b) => byName.compare(a.name, b.name));
}

/** GRV-52: quem tem `group.edit` muda a modalidade, com a `version` conferida (ADR 0016). Só informa. */
export async function setGroupModality(
  deps: GroupsDeps,
  userId: UserId,
  publicId: PublicGroupId,
  input: SetGroupModalityInput,
): Promise<Group> {
  const { id, membership, roles } = await requireMembership(deps, userId, publicId);
  requirePermission(membership, roles, 'group.edit');
  await deps.groups.setModality(id, input.modality, input.expectedVersion, deps.now());
  const group = await deps.groups.get(id, { consistent: true });
  if (!group) throw appError('GROUP_NOT_FOUND');
  return toGroup(deps, group, membership, roles);
}
