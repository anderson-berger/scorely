// Convites (GRV-18–24): criar, listar, cancelar, recusar e entrar por um convite.
import { QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  dbItem,
  LOOKUP_ENTITY,
  stripKeys,
  type TransactItem,
  touch,
  transactWrite,
  ttlFrom,
} from '@scorely/api/src/lib/db';
import { dynamo, tableName } from '@scorely/api/src/lib/dynamo';
import { asGroupId, type GroupId, type UserId } from '@scorely/api/src/lib/ids';
import {
  getItem,
  participantsDelta,
  queryByPrefix,
} from '@scorely/api/src/modules/groups/data/groups.dynamo';
import {
  emailGroupInvitesLookupKey,
  emailGroupInvitesLookupPk,
  GROUP_INVITE_ENTITY,
  GROUP_INVITE_PREFIX,
  GROUP_INVITE_USE_ENTITY,
  GROUP_INVITE_USE_PREFIX,
  GROUP_MEMBER_ENTITY,
  groupInviteKey,
  groupInviteTokenLookupKey,
  groupInviteUseKey,
  groupMemberKey,
  groupRequestKey,
  userGroupInvitesLookupKey,
  userGroupInvitesLookupPk,
  userGroupsLookupKey,
} from '@scorely/api/src/modules/groups/data/groups.table';
import type {
  InviteTarget,
  JoinAction,
  JoinByInviteResult,
  StoredInvite,
  StoredInviteUse,
  StoredMembership,
} from '@scorely/api/src/modules/groups/data/groups.types';

/** Dias que o convite que deixou de valer continua na lista (GRV-19). */
export const INVITE_GRACE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
export const graceTtl = (from: Date) => ttlFrom(new Date(from.getTime() + INVITE_GRACE_DAYS * DAY_MS));

/** O lookup do alvo do convite pessoal (GRV-24): o da conta ou o do email. */
function targetLookupKey(invite: StoredInvite & { target: InviteTarget }) {
  return 'userId' in invite.target
    ? userGroupInvitesLookupKey(invite.target.userId, invite.id)
    : emailGroupInvitesLookupKey(invite.target.email, invite.id);
}

/** O convite pessoal grava o lookup do alvo, na mesma transação do convite (GRV-24). */
function targetLookups(invite: StoredInvite): TransactItem[] {
  if (!invite.target) return [];
  const body = {
    groupId: invite.groupId,
    inviteId: invite.id,
    ...(invite.ttl !== undefined && { ttl: invite.ttl }),
  };
  return [
    {
      Put: {
        TableName: tableName(),
        Item: dbItem(
          targetLookupKey({ ...invite, target: invite.target }),
          LOOKUP_ENTITY,
          body,
          invite.createdAt,
        ),
      },
    },
  ];
}

/** Os lookups do convite somem junto com ele: o do token e, no convite pessoal, o do alvo (GRV-24). */
function lookupTtls(invite: StoredInvite, ttl: number): TransactItem[] {
  const keys = [
    groupInviteTokenLookupKey(invite.token),
    ...(invite.target ? [targetLookupKey({ ...invite, target: invite.target })] : []),
  ];
  // O lookup é gravado com o convite: faltar é bug, e o Update não pode criar um item só com a chave e o `ttl`.
  return keys.map((Key) => ({
    Update: {
      TableName: tableName(),
      Key,
      UpdateExpression: 'SET #ttl = :ttl',
      ConditionExpression: 'attribute_exists(PK)',
      ExpressionAttributeNames: { '#ttl': 'ttl' },
      ExpressionAttributeValues: { ':ttl': ttl },
    },
  }));
}

/**
 * Convite sem prazo que deixou de valer: os `INVITEUSE` já gravados ganham o `ttl` dele, logo depois da transação e
 * fora dela (o convite sem limite pode ter muitos usos). Se falhar, o uso que sobrar é ignorado na lista (GRV-19).
 */
async function expireInviteUses(invite: StoredInvite, ttl: number): Promise<void> {
  if (invite.expiresAt !== undefined) return; // com prazo, o `ttl` já foi gravado em cada uso
  try {
    const rows = await queryByPrefix(invite.groupId, `${GROUP_INVITE_USE_PREFIX}${invite.id}#`);
    await Promise.all(
      rows.map((row) =>
        dynamo().send(
          new UpdateCommand({
            TableName: tableName(),
            Key: { PK: row.PK as string, SK: row.SK as string },
            UpdateExpression: 'SET #ttl = :ttl',
            ConditionExpression: 'attribute_exists(PK)',
            ExpressionAttributeNames: { '#ttl': 'ttl' },
            ExpressionAttributeValues: { ':ttl': ttl },
          }),
        ),
      ),
    );
  } catch (error) {
    console.error(
      JSON.stringify({ msg: 'Invite uses ttl failed', inviteId: invite.id, error: String(error) }),
    );
  }
}

export interface InviteRepository {
  /** Convite + lookup do token, numa transação (GRV-18). */
  createInvite(invite: StoredInvite): Promise<void>;
  /** Todos os convites do grupo, em ordem qualquer (o service ordena e filtra). */
  listInvites(groupId: GroupId): Promise<StoredInvite[]>;
  /** `consistent`: leitura forte, para reler depois de a gravação de entrar falhar (GRV-22). */
  getInvite(
    groupId: GroupId,
    inviteId: string,
    opts?: { consistent?: boolean },
  ): Promise<StoredInvite | undefined>;
  /** Token → chave do convite. */
  resolveToken(token: string): Promise<{ groupId: GroupId; inviteId: string } | undefined>;
  /** Marca como cancelado (GRV-20) e agenda a limpeza (`ttl`). Quem chama já conferiu que vale. */
  revokeInvite(invite: StoredInvite, at: Date): Promise<void>;
  /** Os convites pessoais da pessoa, pelo id ou pelo email (GRV-24); em ordem qualquer, inclusive os que já não valem. */
  listInvitesFor(target: InviteTarget): Promise<{ groupId: GroupId; inviteId: string }[]>;
  /**
   * O convite pessoal `inviteId` feito para a pessoa (GRV-24, recusar): lê o lookup da conta e, sem ele e com email, o
   * do email. `undefined` = não é um convite para ela.
   */
  findPersonalInvite(
    inviteId: string,
    who: { userId: UserId; email?: string | undefined },
  ): Promise<{ groupId: GroupId; inviteId: string } | undefined>;
  /** Marca como recusado (GRV-24) e agenda a limpeza (`ttl`). Quem chama já conferiu que vale. */
  declineInvite(invite: StoredInvite, at: Date): Promise<void>;
  /** Quem entrou por convites do grupo (GRV-19). */
  listInviteUses(groupId: GroupId): Promise<StoredInviteUse[]>;
  /**
   * Entrar (GRV-22), numa transação: soma 1 em `uses` com a condição de valer (sem passar do limite), grava ou sobe a
   * participação, o lookup do usuário e o uso. O `ttl` do convite entra quando este é o último uso.
   */
  joinByInvite(input: {
    invite: StoredInvite;
    userId: UserId;
    action: JoinAction;
    now: Date;
  }): Promise<JoinByInviteResult>;
}

export const dynamoInviteRepository: InviteRepository = {
  async createInvite(invite) {
    const lookupTtl = invite.ttl;
    const result = await transactWrite([
      {
        Put: {
          TableName: tableName(),
          Item: dbItem(groupInviteKey(invite.groupId, invite.id), GROUP_INVITE_ENTITY, invite),
        },
      },
      {
        Put: {
          TableName: tableName(),
          Item: dbItem(
            groupInviteTokenLookupKey(invite.token),
            LOOKUP_ENTITY,
            {
              groupId: invite.groupId,
              inviteId: invite.id,
              ...(lookupTtl !== undefined && { ttl: lookupTtl }),
            },
            invite.createdAt,
          ),
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      ...targetLookups(invite),
    ]);
    if (!result.ok) throw new Error('Invite create failed');
  },

  async listInvites(groupId) {
    const rows = await queryByPrefix(groupId, GROUP_INVITE_PREFIX);
    return rows.map((row) => ({ ...stripKeys<StoredInvite>(row), ttl: row.ttl as number | undefined }));
  },

  async getInvite(groupId, inviteId, opts) {
    const item = await getItem(groupInviteKey(groupId, inviteId), opts?.consistent);
    return item ? { ...stripKeys<StoredInvite>(item), ttl: item.ttl as number | undefined } : undefined;
  },

  async resolveToken(token) {
    const pointer = await getItem(groupInviteTokenLookupKey(token));
    return pointer
      ? { groupId: asGroupId(pointer.groupId as string), inviteId: pointer.inviteId as string }
      : undefined;
  },

  async revokeInvite(invite, at) {
    const { groupId, id: inviteId } = invite;
    await transactWrite([
      {
        Update: touch(
          {
            TableName: tableName(),
            Key: groupInviteKey(groupId, inviteId),
            UpdateExpression: 'SET revokedAt = :at, #ttl = :ttl',
            ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(revokedAt)',
            ExpressionAttributeNames: { '#ttl': 'ttl' },
            ExpressionAttributeValues: { ':at': at.toISOString(), ':ttl': graceTtl(at) },
          },
          at,
        ),
      },
      ...lookupTtls(invite, graceTtl(at)),
    ]);
    await expireInviteUses(invite, graceTtl(at));
  },

  async listInvitesFor(target) {
    const pk =
      'userId' in target ? userGroupInvitesLookupPk(target.userId) : emailGroupInvitesLookupPk(target.email);
    const { Items = [] } = await dynamo().send(
      new QueryCommand({
        TableName: tableName(),
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': pk },
      }),
    );
    return Items.map((row) => ({
      groupId: asGroupId(row.groupId as string),
      inviteId: row.inviteId as string,
    }));
  },

  async findPersonalInvite(inviteId, who) {
    const byUser = await getItem(userGroupInvitesLookupKey(who.userId, inviteId));
    const pointer =
      byUser ??
      (who.email !== undefined ? await getItem(emailGroupInvitesLookupKey(who.email, inviteId)) : undefined);
    return pointer
      ? { groupId: asGroupId(pointer.groupId as string), inviteId: pointer.inviteId as string }
      : undefined;
  },

  async declineInvite(invite, at) {
    const { groupId, id: inviteId } = invite;
    await transactWrite([
      {
        Update: touch(
          {
            TableName: tableName(),
            Key: groupInviteKey(groupId, inviteId),
            UpdateExpression: 'SET declinedAt = :at, #ttl = :ttl',
            ConditionExpression:
              'attribute_exists(PK) AND attribute_not_exists(declinedAt) AND attribute_not_exists(revokedAt)',
            ExpressionAttributeNames: { '#ttl': 'ttl' },
            ExpressionAttributeValues: { ':at': at.toISOString(), ':ttl': graceTtl(at) },
          },
          at,
        ),
      },
      ...lookupTtls(invite, graceTtl(at)),
    ]);
    await expireInviteUses(invite, graceTtl(at));
  },

  async listInviteUses(groupId) {
    const rows = await queryByPrefix(groupId, GROUP_INVITE_USE_PREFIX);
    return rows.map((row) => stripKeys<StoredInviteUse>(row));
  },

  async joinByInvite({ invite, userId, action, now }) {
    const at = now.toISOString();
    const lastUse = invite.maxUses !== undefined && invite.uses + 1 >= invite.maxUses;
    const useInvite: TransactItem = {
      Update: touch(
        {
          TableName: tableName(),
          Key: groupInviteKey(invite.groupId, invite.id),
          UpdateExpression: `${lastUse ? 'SET #ttl = :ttl ' : ''}ADD uses :one`,
          ConditionExpression:
            'attribute_exists(PK) AND attribute_not_exists(revokedAt) AND attribute_not_exists(declinedAt)' +
            ' AND (attribute_not_exists(expiresAt) OR expiresAt > :now)' +
            // Com limite, `uses` igual ao lido: outro uso que entrou antes faz o service reler (e o `ttl` de esgotado
            // nunca é calculado sobre uma leitura atrasada). E abaixo do limite: nunca passa dele (GRV-18).
            (invite.maxUses !== undefined ? ' AND uses = :uses AND uses < :max' : ''),
          ...(lastUse && { ExpressionAttributeNames: { '#ttl': 'ttl' } }),
          ExpressionAttributeValues: {
            ':one': 1,
            ':now': at,
            ...(invite.maxUses !== undefined && { ':uses': invite.uses, ':max': invite.maxUses }),
            ...(lastUse && { ':ttl': graceTtl(now) }),
          },
        },
        now,
      ),
    };
    const membership: TransactItem =
      action === 'join'
        ? {
            Put: {
              TableName: tableName(),
              Item: dbItem(
                groupMemberKey(invite.groupId, userId),
                GROUP_MEMBER_ENTITY,
                {
                  groupId: invite.groupId,
                  userId,
                  tier: invite.tier,
                  role: 'everyone',
                  createdAt: at,
                  inviteId: invite.id,
                  invitedBy: invite.createdBy,
                } satisfies StoredMembership,
                at,
              ),
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          }
        : {
            Update: {
              TableName: tableName(),
              Key: groupMemberKey(invite.groupId, userId),
              UpdateExpression: 'SET tier = :member, inviteId = :inviteId, invitedBy = :invitedBy',
              ConditionExpression: 'tier = :reserve',
              ExpressionAttributeValues: {
                ':member': 'member',
                ':reserve': 'reserve',
                ':inviteId': invite.id,
                ':invitedBy': invite.createdBy,
              },
            },
          };
    const use: StoredInviteUse = { groupId: invite.groupId, inviteId: invite.id, userId, createdAt: at };
    // Com prazo, o `ttl` já é conhecido; sem prazo, este uso que esgota leva o `ttl` (a Query de depois pode não vê-lo).
    const ttl =
      invite.expiresAt !== undefined
        ? graceTtl(new Date(invite.expiresAt))
        : lastUse
          ? graceTtl(now)
          : undefined;
    // GRV-54: só quem entra conta; a reserva que sobe já estava na conta. Fica no índice 2, para ler a falha.
    const counter: TransactItem[] = action === 'join' ? [participantsDelta(invite.groupId, 1, at)] : [];
    const items: TransactItem[] = [
      useInvite,
      membership,
      ...counter,
      {
        Put: {
          TableName: tableName(),
          Item: dbItem(
            groupInviteUseKey(invite.groupId, invite.id, userId),
            GROUP_INVITE_USE_ENTITY,
            { ...use, ...(ttl !== undefined && { ttl }) },
            at,
          ),
        },
      },
      // Convite sem prazo que esgota: o lookup do token também ganha o `ttl` (some junto com o convite).
      ...(lastUse ? lookupTtls(invite, graceTtl(now)) : []),
      ...(action === 'join'
        ? [
            {
              Put: {
                TableName: tableName(),
                Item: dbItem(
                  userGroupsLookupKey(userId, invite.groupId),
                  LOOKUP_ENTITY,
                  { id: invite.groupId },
                  at,
                ),
              },
            },
          ]
        : []),
      // GRV-22: o pedido esperando some na mesma operação (sem condição: quase sempre não há).
      { Delete: { TableName: tableName(), Key: groupRequestKey(invite.groupId, userId) } },
    ];
    const result = await transactWrite(items);
    if (result.ok && lastUse) await expireInviteUses(invite, graceTtl(now));
    if (result.ok) return 'ok';
    if (result.failed.includes(0)) return 'invite_stale';
    if (result.failed.includes(1)) return 'membership_stale';
    if (action === 'join' && result.failed.includes(2)) return 'group_full';
    throw new Error('Group join failed');
  },
};
