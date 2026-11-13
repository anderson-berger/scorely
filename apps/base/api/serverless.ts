import { project, tableNameFor } from '@base/api/project';
import { healthFunctions } from '@base/api/src/modules/health/functions';
import { itemsFunctions } from '@base/api/src/modules/items/functions';
import type { AWS } from '@serverless/typescript';

// A tabela é criada pelo stack infra/<projeto> (não aqui).
// Deploy via serverless-compose.ts → param tableName = output TableName do <projeto>-infra.
// Dev local (serverless offline fora do compose) → fallback custom.localTableName.
const tableName = '${param:tableName, self:custom.localTableName}';

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
    httpApi: { cors: true },
    environment: {
      NODE_OPTIONS: '--enable-source-maps',
      TABLE_NAME: tableName,
      DYNAMODB_ENDPOINT: "${env:DYNAMODB_ENDPOINT, ''}",
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
        ],
      },
    },
  },

  build: {
    esbuild: { bundle: true, minify: false, sourcemap: true },
  },

  custom: {
    localTableName: tableNameFor('${sls:stage}'),
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
    ...itemsFunctions,
  },
};

export default config;
