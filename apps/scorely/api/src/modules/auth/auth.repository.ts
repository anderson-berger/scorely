import { DeleteCommand, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { dbItem, isConditionFailed, stripKeys, ttlFrom } from '@scorely/api/src/lib/db';
import { dynamo, tableName } from '@scorely/api/src/lib/dynamo';
import {
  LOGIN_CODE_ENTITY,
  type LoginCode,
  loginCodeKey,
  SESSION_ENTITY,
  type Session,
  sessionKey,
} from '@scorely/api/src/modules/auth/auth.table';

export interface AuthRepository {
  getCode(email: string): Promise<LoginCode | undefined>;
  /** Grava (substituindo) o código; o item expira sozinho em `expireAt`. */
  putCode(code: LoginCode, expireAt: Date): Promise<void>;
  /** Conta uma tentativa ANTES de comparar (atômico): `undefined` se não há código ou estourou o limite. */
  registerAttempt(email: string, maxAttempts: number): Promise<LoginCode | undefined>;
  /** Apaga o código se ainda for o mesmo (uso único). */
  consumeCode(email: string, codeHash: string): Promise<boolean>;

  getSession(id: string): Promise<Session | undefined>;
  putSession(session: Session): Promise<void>;
  /** Troca o hash do refresh token se o atual ainda for `currentHash` (rotação). */
  rotateSession(id: string, currentHash: string, nextHash: string, expiresAt: string): Promise<boolean>;
  deleteSession(id: string): Promise<void>;
}

export const dynamoAuthRepository: AuthRepository = {
  async getCode(email) {
    const { Item } = await dynamo().send(
      new GetCommand({ TableName: tableName(), Key: loginCodeKey(email) }),
    );
    return Item ? stripKeys<LoginCode>(Item) : undefined;
  },

  async putCode(code, expireAt) {
    await dynamo().send(
      new PutCommand({
        TableName: tableName(),
        Item: { ...dbItem(loginCodeKey(code.email), LOGIN_CODE_ENTITY, code), ttl: ttlFrom(expireAt) },
      }),
    );
  },

  async registerAttempt(email, maxAttempts) {
    try {
      const { Attributes } = await dynamo().send(
        new UpdateCommand({
          TableName: tableName(),
          Key: loginCodeKey(email),
          UpdateExpression: 'ADD attempts :one',
          ConditionExpression: 'attribute_exists(PK) AND attempts < :max',
          ExpressionAttributeValues: { ':one': 1, ':max': maxAttempts },
          ReturnValues: 'ALL_NEW',
        }),
      );
      return Attributes ? stripKeys<LoginCode>(Attributes) : undefined;
    } catch (err) {
      if (isConditionFailed(err)) return undefined;
      throw err;
    }
  },

  async consumeCode(email, codeHash) {
    try {
      await dynamo().send(
        new DeleteCommand({
          TableName: tableName(),
          Key: loginCodeKey(email),
          ConditionExpression: 'codeHash = :hash',
          ExpressionAttributeValues: { ':hash': codeHash },
        }),
      );
      return true;
    } catch (err) {
      if (isConditionFailed(err)) return false;
      throw err;
    }
  },

  async getSession(id) {
    const { Item } = await dynamo().send(new GetCommand({ TableName: tableName(), Key: sessionKey(id) }));
    return Item ? stripKeys<Session>(Item) : undefined;
  },

  async putSession(session) {
    await dynamo().send(
      new PutCommand({
        TableName: tableName(),
        Item: {
          ...dbItem(sessionKey(session.id), SESSION_ENTITY, session),
          ttl: ttlFrom(new Date(session.expiresAt)),
        },
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    );
  },

  async rotateSession(id, currentHash, nextHash, expiresAt) {
    try {
      await dynamo().send(
        new UpdateCommand({
          TableName: tableName(),
          Key: sessionKey(id),
          UpdateExpression: 'SET tokenHash = :next, expiresAt = :expiresAt, #ttl = :ttl',
          ConditionExpression: 'tokenHash = :current',
          ExpressionAttributeNames: { '#ttl': 'ttl' },
          ExpressionAttributeValues: {
            ':next': nextHash,
            ':current': currentHash,
            ':expiresAt': expiresAt,
            ':ttl': ttlFrom(new Date(expiresAt)),
          },
        }),
      );
      return true;
    } catch (err) {
      if (isConditionFailed(err)) return false;
      throw err;
    }
  },

  async deleteSession(id) {
    await dynamo().send(new DeleteCommand({ TableName: tableName(), Key: sessionKey(id) }));
  },
};
