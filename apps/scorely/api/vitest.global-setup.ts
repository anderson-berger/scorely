import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
  ListTablesCommand,
} from '@aws-sdk/client-dynamodb';
import { singleTableSchema, tableNameFor } from '@infra/shared/single-table';
import type { TestProject } from 'vitest/node';

// Tabela própria da execução para as suítes de contrato dos repositórios (ADR 0019). O DynamoDB Local é obrigatório:
// sem ele o `npm run check` falha, e não pula em silêncio.

const PREFIX = tableNameFor('scorely', 'test-');
const STALE_MS = 60 * 60 * 1000;
const endpoint = process.env.DYNAMODB_ENDPOINT ?? 'http://localhost:8000';

declare module 'vitest' {
  export interface ProvidedContext {
    dynamoTableName: string;
    dynamoEndpoint: string;
  }
}

function unreachable(err: unknown): boolean {
  const code =
    (err as { code?: string; cause?: { code?: string } }).code ??
    (err as { cause?: { code?: string } }).cause?.code;
  return ['EAI_AGAIN', 'ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'UND_ERR_CONNECT_TIMEOUT'].includes(
    code ?? '',
  );
}

export default async function setup(project: TestProject) {
  const client = new DynamoDBClient({
    region: 'sa-east-1',
    endpoint,
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  });
  const TableName = `${PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    const { TableNames = [] } = await client.send(new ListTablesCommand({}));
    // Execuções que caíram sem apagar a própria tabela. Só as de mais de 1 hora: outra execução pode estar em andamento.
    const stale = Date.now() - STALE_MS;
    await Promise.all(
      TableNames.filter(
        (t) => t.startsWith(PREFIX) && Number(t.slice(PREFIX.length).split('-')[0]) < stale,
      ).map((t) => client.send(new DeleteTableCommand({ TableName: t }))),
    );
    await client.send(
      new CreateTableCommand({
        TableName,
        ...singleTableSchema,
        AttributeDefinitions: [...singleTableSchema.AttributeDefinitions],
        KeySchema: [...singleTableSchema.KeySchema],
      }),
    );
  } catch (err) {
    if (unreachable(err)) {
      throw new Error(
        [
          `DynamoDB Local is down at ${endpoint}: the repository tests (ADR 0019) need it.`,
          'Inside the devcontainer: "Dev Containers: Rebuild Container" (or, on the host,',
          '`docker compose -f .devcontainer/docker-compose.yml up -d dynamodb`).',
          'Outside the container: start the service and set DYNAMODB_ENDPOINT=http://localhost:8000.',
        ].join('\n'),
      );
    }
    throw err;
  }
  project.provide('dynamoTableName', TableName);
  project.provide('dynamoEndpoint', endpoint);
  return async () => {
    await client.send(new DeleteTableCommand({ TableName }));
    client.destroy();
  };
}
