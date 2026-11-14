import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { dbItem, isConditionFailed, stripKeys } from '@scorely/api/src/lib/db';
import { dynamo, tableName } from '@scorely/api/src/lib/dynamo';
import { appError } from '@scorely/api/src/lib/errors';
import { COMPETITION_ENTITY, competitionKey } from '@scorely/api/src/modules/competition/competition.table';
import type { CompetitionPlan, CompetitionRules } from '@scorely/contracts';

/** A competição do grupo como fica no banco (a resposta é a `Competition` de @scorely/contracts). */
export interface StoredCompetition {
  groupId: string;
  plan: CompetitionPlan;
  /** Até quando vale (CMP-01). A equipe muda direto no banco para liberar o plano (CMP-03). */
  activeUntil: string;
  trialStartedAt: string;
  rules: CompetitionRules;
  createdAt: string;
  updatedAt: string;
}

export interface CompetitionRepository {
  get(groupId: string): Promise<StoredCompetition | undefined>;
  /** CMP-02: grava o item novo. Já existe (o teste foi usado) → `COMPETITION_TRIAL_USED`. */
  create(item: StoredCompetition): Promise<void>;
  /** CMP-07: troca o regulamento. Sem item ou com `activeUntil <= now` → `COMPETITION_INACTIVE` (CMP-04). */
  updateRules(groupId: string, rules: CompetitionRules, now: string): Promise<void>;
}

export const dynamoCompetitionRepository: CompetitionRepository = {
  async get(groupId) {
    const { Item } = await dynamo().send(
      new GetCommand({ TableName: tableName(), Key: competitionKey(groupId) }),
    );
    return Item ? stripKeys<StoredCompetition>(Item) : undefined;
  },

  async create(item) {
    try {
      await dynamo().send(
        new PutCommand({
          TableName: tableName(),
          Item: dbItem(competitionKey(item.groupId), COMPETITION_ENTITY, item, item.createdAt),
          ConditionExpression: 'attribute_not_exists(PK)',
        }),
      );
    } catch (err) {
      if (isConditionFailed(err)) throw appError('COMPETITION_TRIAL_USED');
      throw err;
    }
  },

  async updateRules(groupId, rules, now) {
    try {
      await dynamo().send(
        new UpdateCommand({
          TableName: tableName(),
          Key: competitionKey(groupId),
          UpdateExpression: 'SET #rules = :rules, updatedAt = :now',
          ConditionExpression: 'attribute_exists(PK) AND activeUntil > :now',
          ExpressionAttributeNames: { '#rules': 'rules' },
          ExpressionAttributeValues: { ':rules': rules, ':now': now },
        }),
      );
    } catch (err) {
      if (isConditionFailed(err)) throw appError('COMPETITION_INACTIVE');
      throw err;
    }
  },
};
