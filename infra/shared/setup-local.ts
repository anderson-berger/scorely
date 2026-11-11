/**
 * Cria a tabela de um projeto no DynamoDB Local (idempotente). Com `--uploads`, cria também o bucket
 * de uploads, o CORS e a limpeza do `tmp/` no S3 local (S3Mock, módulo de mídia). Uso: tsx ../shared/setup-local.ts <projeto> [--uploads]
 */
import {
  CreateTableCommand,
  DescribeTableCommand,
  DescribeTimeToLiveCommand,
  DynamoDBClient,
  ResourceNotFoundException,
  UpdateTimeToLiveCommand,
} from '@aws-sdk/client-dynamodb';
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  PutBucketLifecycleConfigurationCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { singleTableSchema, tableNameFor, ttlAttribute } from './single-table';
import { MEDIA_PREFIXES, TMP_EXPIRATION_DAYS, uploadsBucketFor } from './uploads-bucket';

const project = process.argv[2];
if (!project) throw new Error('Uso: tsx setup-local.ts <projeto>');

const stage = process.env.STAGE ?? 'dev';
const TableName = tableNameFor(project, stage);
const endpoint = process.env.DYNAMODB_ENDPOINT ?? 'http://localhost:8000';
const withUploads = process.argv.includes('--uploads');
const s3Endpoint = process.env.S3_ENDPOINT ?? 'http://localhost:9090';

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
  if (withUploads) await ensureUploadsBucket();
  await ensureTtl().catch((err: unknown) => {
    // O DynamoDB Local não apaga itens vencidos de qualquer jeito: a validade vem do expiresAt (ADR 0004)
    console.warn(`⚠ TTL não ligado em ${TableName}: ${(err as Error).message}`);
  });
}

/** Bucket local + CORS para o POST assinado do navegador (na AWS isso vem do stack de infra). */
async function ensureUploadsBucket() {
  const Bucket = uploadsBucketFor(project as string, stage);
  const s3 = new S3Client({
    region: 'sa-east-1',
    endpoint: s3Endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  });
  const exists = await s3.send(new HeadBucketCommand({ Bucket })).then(
    () => true,
    () => false,
  );
  if (!exists) await s3.send(new CreateBucketCommand({ Bucket }));
  await s3
    .send(
      new PutBucketCorsCommand({
        Bucket,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedMethods: ['POST', 'GET'],
              AllowedOrigins: ['*'],
              AllowedHeaders: ['*'],
              MaxAgeSeconds: 3000,
            },
          ],
        },
      }),
    )
    // O S3Mock não implementa PutBucketCors e já libera CORS para qualquer origem (ADR 0008): segue sem avisar.
    .catch(() => undefined);
  await s3
    .send(
      new PutBucketLifecycleConfigurationCommand({
        Bucket,
        LifecycleConfiguration: {
          Rules: [
            {
              ID: 'ExpireTmpUploads',
              Status: 'Enabled',
              Filter: { Prefix: MEDIA_PREFIXES.tmp },
              Expiration: { Days: TMP_EXPIRATION_DAYS },
            },
          ],
        },
      }),
    )
    // MID-13: no S3Mock a limpeza pode não existir; o TTL do banco ainda vence a mídia pendente.
    .catch(() => undefined);
  console.log(`✔ bucket ${Bucket} ${exists ? 'já existe' : 'criado'} (${s3Endpoint})`);
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
        `✖ Serviço local fora do ar (${(err as { code: string }).code}): DynamoDB Local em ${endpoint}${withUploads ? `, S3 em ${s3Endpoint}` : ''}.`,
        '  Dentro do devcontainer: "Dev Containers: Rebuild Container" (ou, no host,',
        '  `docker compose -f .devcontainer/docker-compose.yml up -d dynamodb s3`).',
        '  Fora do container: suba os serviços e use DYNAMODB_ENDPOINT=http://localhost:8000 (e S3_ENDPOINT=http://localhost:9090).',
      ].join('\n'),
    );
  } else {
    console.error(err);
  }
  process.exit(1);
});
