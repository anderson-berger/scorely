// Regras de DynamoDB (.claude/rules/dynamodb.md): sem GSI/LSI, e todo `*Command` usado no código
// tem a ação correspondente no IAM do serverless.ts da api.

import { apiSources, filesUnder, loadConfig, projects, read } from '@checks/lib';
import { describe, expect, it } from 'vitest';

const INDEX = /GlobalSecondaryIndexes|LocalSecondaryIndexes|IndexName/;

function indexViolations(files: { path: string; text: string }[]): string[] {
  return files.filter((f) => INDEX.test(f.text)).map((f) => `${f.path}: GSI/LSI (use lookups)`);
}

/**
 * Ações de IAM que cada Command do SDK exige. `TransactWriteCommand` exige as ações dos itens
 * (Put/Update/Delete/ConditionCheck), que aparecem nos próprios Commands ou estão no IAM.
 * Command novo fora daqui → o check falha até alguém mapeá-lo.
 */
const ACTIONS: Record<string, string[]> = {
  GetCommand: ['dynamodb:GetItem'],
  PutCommand: ['dynamodb:PutItem'],
  UpdateCommand: ['dynamodb:UpdateItem'],
  DeleteCommand: ['dynamodb:DeleteItem'],
  QueryCommand: ['dynamodb:Query'],
  ScanCommand: ['dynamodb:Scan'],
  BatchGetCommand: ['dynamodb:BatchGetItem'],
  BatchWriteCommand: ['dynamodb:BatchWriteItem'],
  TransactGetCommand: ['dynamodb:GetItem'],
  TransactWriteCommand: [
    'dynamodb:PutItem',
    'dynamodb:UpdateItem',
    'dynamodb:DeleteItem',
    'dynamodb:ConditionCheckItem',
  ],
  SendEmailCommand: ['ses:SendEmail'],
  // S3 (mídia, docs/modules/midia.md). O POST assinado exige s3:PutObject, mas não é um Command.
  HeadObjectCommand: ['s3:GetObject'],
  DeleteObjectCommand: ['s3:DeleteObject'],
  GetObjectCommand: ['s3:GetObject'],
  // CopyObject lê a origem e grava o destino
  CopyObjectCommand: ['s3:GetObject', 's3:PutObject'],
};

const COMMAND = /\bnew\s+([A-Z][A-Za-z]+Command)\b/g;

function commandViolations(sources: string[], iamActions: string[]): string[] {
  const used = new Set(sources.flatMap((text) => [...text.matchAll(COMMAND)].map((m) => m[1] as string)));
  const granted = new Set(iamActions);
  return [...used].flatMap((cmd) => {
    const needed = ACTIONS[cmd];
    if (!needed) return [`${cmd}: Command sem mapeamento em checks/dynamodb.test.ts`];
    return needed.filter((a) => !granted.has(a)).map((a) => `${cmd} precisa de ${a} no IAM`);
  });
}

describe('dynamodb: sem GSI/LSI', () => {
  it('nenhum índice secundário no código de apps e infra', () => {
    const files = [...filesUnder('apps'), ...filesUnder('infra'), 'serverless-compose.ts']
      .filter((p) => p.endsWith('.ts'))
      .map((path) => ({ path, text: read(path) }));
    expect(indexViolations(files)).toEqual([]);
  });
});

describe.each(projects())('dynamodb: %s/api', (project) => {
  it('todo Command usado tem a ação no IAM', async () => {
    const config = await loadConfig(project);
    const actions = (config.provider.iam?.role?.statements ?? []).flatMap((s) => s.Action ?? []);
    expect(actions.length).toBeGreaterThan(0);
    expect(commandViolations(apiSources(project).map(read), actions)).toEqual([]);
  });
});

describe('dynamodb: os checks pegam a violação plantada', () => {
  it('GSI', () => {
    expect(indexViolations([{ path: 'x.ts', text: 'GlobalSecondaryIndexes: []' }])).toHaveLength(1);
  });
  it('Command sem ação no IAM', () => {
    expect(commandViolations(['new ScanCommand({})'], ['dynamodb:GetItem'])).toEqual([
      'ScanCommand precisa de dynamodb:Scan no IAM',
    ]);
  });
  it('Command desconhecido', () => {
    expect(commandViolations(['new FooCommand({})'], [])).toHaveLength(1);
  });
});
