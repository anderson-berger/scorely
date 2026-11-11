import type { AWS } from '@serverless/typescript';
import { devAuthSecret, project, tableNameFor, uploadsBucketFor } from './project';
import { AUTHORIZER } from './src/lib/auth';
import { authFunctions } from './src/modules/auth/functions';
import { groupsFunctions } from './src/modules/groups/functions';
import { healthFunctions } from './src/modules/health/functions';
import { notificationsFunctions } from './src/modules/notifications/functions';
import { teamsFunctions } from './src/modules/teams/functions';
import { usersFunctions } from './src/modules/users/functions';

// A tabela é criada pelo stack infra/<projeto> (não aqui).
// Deploy via serverless-compose.ts → param tableName = output TableName do <projeto>-infra.
// Dev local (serverless offline fora do compose) → fallback custom.localTableName.
const tableName = '${param:tableName, self:custom.localTableName}';
// Bucket de uploads (plano 010): output UploadsBucketName do <projeto>-infra; local → custom.localUploadsBucket.
const uploadsBucket = '${param:uploadsBucket, self:custom.localUploadsBucket}';

// `serverless offline` usa um segredo fixo de dev; qualquer outro comando (deploy/package) lê do SSM.
// Crie antes do primeiro deploy: /scorely/<stage>/auth-secret (SecureString, 32+ caracteres).
const isOffline = process.argv.includes('offline');
const authSecret = isOffline ? devAuthSecret : `\${ssm:/${project.name}/\${sls:stage}/auth-secret}`;

const config: AWS = {
  service: project.name,
  frameworkVersion: '4',

  provider: {
    name: 'aws',
    runtime: 'nodejs22.x',
    region: 'sa-east-1',
    stage: "${opt:stage, 'dev'}",
    memorySize: 256,
    timeout: 10,
    httpApi: {
      cors: true,
      // Rotas com `authorizer: { name: AUTHORIZER }` só chegam à lambda com um access token válido.
      // Sem header Authorization → 401; token inválido ou expirado → 403. O web renova a sessão nos dois casos.
      // Sem cache (TTL 0): com cache, um token expirado continuaria passando até o fim do TTL.
      authorizers: {
        [AUTHORIZER]: {
          type: 'request',
          functionName: 'authAuthorizer',
          identitySource: ['$request.header.Authorization'],
          enableSimpleResponses: true,
          payloadVersion: '2.0',
          resultTtlInSeconds: 0,
        },
      },
    },
    environment: {
      NODE_OPTIONS: '--enable-source-maps',
      TABLE_NAME: tableName,
      DYNAMODB_ENDPOINT: "${env:DYNAMODB_ENDPOINT, ''}",
      UPLOADS_BUCKET: uploadsBucket,
      // Só no dev local (S3Mock): endpoint interno e o que o navegador alcança (a assinatura inclui o host)
      S3_ENDPOINT: "${env:S3_ENDPOINT, ''}",
      S3_PUBLIC_ENDPOINT: "${env:S3_PUBLIC_ENDPOINT, ''}",
      AUTH_SECRET: authSecret,
      // Sem domínio verificado no SES ainda: o código de login vai para o log (CloudWatch / terminal).
      EMAIL_MODE: "${env:EMAIL_MODE, 'console'}",
      EMAIL_FROM: "${env:EMAIL_FROM, ''}",
    },
    iam: {
      role: {
        statements: [
          {
            Effect: 'Allow',
            Action: [
              'dynamodb:GetItem',
              'dynamodb:PutItem',
              'dynamodb:UpdateItem',
              'dynamodb:DeleteItem',
              'dynamodb:Query',
              'dynamodb:BatchGetItem',
              'dynamodb:ConditionCheckItem',
            ],
            // A tabela está em outro stack: o ARN é montado a partir do nome
            Resource: [
              {
                'Fn::Join': [
                  '',
                  [
                    'arn:aws:dynamodb:',
                    { Ref: 'AWS::Region' },
                    ':',
                    { Ref: 'AWS::AccountId' },
                    ':table/',
                    tableName,
                  ],
                ],
              },
            ],
          },
          {
            Effect: 'Allow',
            Action: ['ses:SendEmail'],
            Resource: [
              {
                'Fn::Join': [
                  '',
                  ['arn:aws:ses:', { Ref: 'AWS::Region' }, ':', { Ref: 'AWS::AccountId' }, ':identity/*'],
                ],
              },
            ],
          },
          {
            // Mídia (midia.md): PutObject assina o POST e é o destino do CopyObject; GetObject cobre o
            // HeadObject, a leitura do cabeçalho e a origem do CopyObject. Só em tmp/* e public/*.
            Effect: 'Allow',
            Action: ['s3:PutObject', 's3:GetObject', 's3:DeleteObject'],
            Resource: [
              { 'Fn::Join': ['', ['arn:aws:s3:::', uploadsBucket, '/tmp/*']] },
              { 'Fn::Join': ['', ['arn:aws:s3:::', uploadsBucket, '/public/*']] },
            ],
          },
          {
            // Sem ListBucket, o HeadObject de uma key inexistente responde 403 (e não 404): o caso 6 viraria 500.
            Effect: 'Allow',
            Action: ['s3:ListBucket'],
            Resource: [{ 'Fn::Join': ['', ['arn:aws:s3:::', uploadsBucket]] }],
          },
        ],
      },
    },
  },

  build: {
    esbuild: { bundle: true, minify: false, sourcemap: true },
  },

  custom: {
    localTableName: tableNameFor('${sls:stage}'),
    localUploadsBucket: uploadsBucketFor('${sls:stage}'),
    'serverless-offline': {
      host: '0.0.0.0',
      httpPort: project.ports.http,
      websocketPort: project.ports.websocket,
      lambdaPort: project.ports.lambda,
      noPrependStageInUrl: true,
    },
  },

  plugins: ['serverless-offline'],

  // Cada módulo declara as próprias functions em src/modules/<mod>/functions.ts
  functions: {
    ...healthFunctions,
    ...authFunctions,
    ...usersFunctions,
    ...notificationsFunctions,
    ...groupsFunctions,
    ...teamsFunctions,
  },
};

export default config;
