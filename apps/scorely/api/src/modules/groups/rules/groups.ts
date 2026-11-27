// Criar, modalidade, identificação e ver o grupo (GRV-01–05, 08, 52), e o contexto que os outros assuntos usam.
import { randomInt } from 'node:crypto';
import { newEntity } from '@scorely/api/src/lib/entity';
import { appError } from '@scorely/api/src/lib/errors';
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

/** O grupo para quem pede: o id público no lugar do uuid (GRV-08), o papel (GRV-04) e as URLs das imagens (GRV-10). */
export function forViewer(
  group: StoredGroup,
  membership: Pick<StoredMembership, 'role' | 'tier'>,
  roles: GroupRoles,
  urlOf: UrlOf = productionUrlOf,
): Group {
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

/** O que os assuntos do grupo usam em comum: as deps, o relógio, as URLs, o acesso e os perfis. */
export function groupContext(deps: GroupsDeps) {
  const now = deps.now ?? (() => new Date());
  const urlOf: UrlOf = (purpose, mediaId) => (deps.media?.urlOf ?? productionUrlOf)(purpose, mediaId);

  /** Quem participa e o grupo; senão `GROUP_NOT_FOUND` (GRV-04, 15). */
  async function access(userId: UserId, publicId: PublicGroupId) {
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
  async function profiles(ids: readonly UserId[]): Promise<Map<UserId, User>> {
    const unique = [...new Set(ids)];
    const records = unique.length > 0 ? await deps.users.getMany(unique) : [];
    return new Map(records.map((r) => [r.id, toUser(r, urlOf)]));
  }

  function profileOf(map: Map<UserId, User>, id: UserId): User {
    const user = map.get(id);
    if (!user) throw new Error('Group participant without a user profile');
    return user;
  }

  return { deps, now, urlOf, access, profiles, profileOf };
}

export type GroupContext = ReturnType<typeof groupContext>;

/** Criar, ver, os meus grupos e a modalidade. */
export function groupRules(ctx: GroupContext) {
  const { deps, now, access } = ctx;
  const newPublicId = deps.newPublicId ?? newPublicGroupId;

  /** GRV-01, 02, 03, 08: o nome já vem validado pelo contrato; quem cria é o dono. */
  async function create(userId: UserId, input: CreateGroupInput, attempt = 1): Promise<Group> {
    // `newEntity` gera o id do sistema (uuid) e o `createdAt`; o `updatedAt` nasce igual (ADR 0013).
    const entity = newEntity<Omit<StoredGroup, 'updatedAt'>>(
      { publicId: newPublicId(), name: input.name, joinMode: 'invite', modality: 'mixed', version: 1 },
      now(),
    );
    const group: StoredGroup = { ...entity, updatedAt: entity.createdAt };
    const result = await deps.groups.create(group, userId);
    if (result === 'public_id_taken') {
      if (attempt >= PUBLIC_ID_ATTEMPTS) throw new Error('Could not allocate a group public id');
      return create(userId, input, attempt + 1);
    }
    return forViewer(group, { role: 'owner', tier: 'member' }, NO_ROLES, deps.media?.urlOf);
  }

  /** GRV-04: quem não participa, ou um código que não existe, recebe `GROUP_NOT_FOUND`. */
  async function get(userId: UserId, publicId: PublicGroupId): Promise<Group> {
    const id = await deps.groups.resolve(publicId);
    if (id === undefined) throw appError('GROUP_NOT_FOUND');
    const [group, membership, roles] = await Promise.all([
      deps.groups.get(id),
      deps.groups.getMembership(id, userId),
      deps.groups.getRoles(id),
    ]);
    if (!group || !membership) throw appError('GROUP_NOT_FOUND');
    return forViewer(group, membership, roles, deps.media?.urlOf);
  }

  /** GRV-05: os grupos de que a pessoa participa, por nome. */
  async function mine(userId: UserId): Promise<Group[]> {
    const rows = await deps.groups.listMine(userId);
    const roles = await Promise.all(rows.map(({ group }) => deps.groups.getRoles(group.id)));
    return rows
      .map(({ group, membership }, i) =>
        forViewer(group, membership, roles[i] as GroupRoles, deps.media?.urlOf),
      )
      .sort((a, b) => byName.compare(a.name, b.name));
  }

  /** GRV-52: quem tem `group.edit` muda a modalidade, com a `version` conferida (ADR 0016). Só informa. */
  async function setModality(
    userId: UserId,
    publicId: PublicGroupId,
    input: SetGroupModalityInput,
  ): Promise<Group> {
    const { id, membership, roles } = await access(userId, publicId);
    requirePermission(membership, roles, 'group.edit');
    await deps.groups.setModality(id, input.modality, input.expectedVersion, now());
    const group = await deps.groups.get(id, { consistent: true });
    if (!group) throw appError('GROUP_NOT_FOUND');
    return forViewer(group, membership, roles, deps.media?.urlOf);
  }

  return { create, get, mine, setModality };
}
