/** Cria a tabela de um projeto no LocalStack (idempotente). Uso: tsx ../shared/setup-local.ts <projeto> */
import {
  CreateTableCommand,
  DescribeTableCommand,
  DescribeTimeToLiveCommand,
  DynamoDBClient,
  ResourceNotFoundException,
  UpdateTimeToLiveCommand,
} from '@aws-sdk/client-dynamodb';
import { singleTableSchema, tableNameFor, ttlAttribute } from './single-table';

const project = process.argv[2];
if (!project) throw new Error('Uso: tsx setup-local.ts <projeto>');

const stage = process.env.STAGE ?? 'dev';
const TableName = tableNameFor(project, stage);
const endpoint = process.env.DYNAMODB_ENDPOINT ?? 'http://localhost:4566';

const client = new DynamoDBClient({
  region: 'sa-east-1',
  endpoint,
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
});

// Sem top-level await: infra/shared não é um pacote ESM
async function main() {
  try {
    await client.send(new DescribeTableCommand({ TableName }));
    console.log(`✔ tabela ${TableName} já existe (${endpoint})`);
  } catch (err) {
    if (!(err instanceof ResourceNotFoundException)) throw err;
    await client.send(
      new CreateTableCommand({
        TableName,
        ...singleTableSchema,
        AttributeDefinitions: [...singleTableSchema.AttributeDefinitions],
        KeySchema: [...singleTableSchema.KeySchema],
      }),
    );
    console.log(`✔ tabela ${TableName} criada (${endpoint})`);
  }
  await ensureTtl();
}

/** CreateTable não aceita TTL: liga depois, também em tabelas que já existiam. */
async function ensureTtl() {
  const { TimeToLiveDescription } = await client.send(new DescribeTimeToLiveCommand({ TableName }));
  if (TimeToLiveDescription?.TimeToLiveStatus === 'ENABLED') return;
  await client.send(
    new UpdateTimeToLiveCommand({
      TableName,
      TimeToLiveSpecification: { AttributeName: ttlAttribute, Enabled: true },
    }),
  );
  console.log(`✔ TTL (${ttlAttribute}) ligado em ${TableName}`);
}

const UNREACHABLE = new Set(['EAI_AGAIN', 'ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET']);

main().catch((err) => {
  if (UNREACHABLE.has((err as { code?: string }).code ?? '')) {
    console.error(
      [
        `✖ LocalStack fora do ar em ${endpoint} (${(err as { code: string }).code}).`,
        '  Dentro do devcontainer: "Dev Containers: Rebuild Container" (ou, no host,',
        '  `docker compose -f .devcontainer/docker-compose.yml up -d localstack`).',
        '  Fora do container: suba o LocalStack e use DYNAMODB_ENDPOINT=http://localhost:4566.',
      ].join('\n'),
    );
  } else {
    console.error(err);
  }
  process.exit(1);
});
