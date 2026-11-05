import type { AWS } from '@serverless/typescript';
import { devAuthSecret, project, tableNameFor } from './project';
import { AUTHORIZER } from './src/lib/auth';
import { authFunctions } from './src/modules/auth/functions';
import { healthFunctions } from './src/modules/health/functions';
import { notificationsFunctions } from './src/modules/notifications/functions';
import { usersFunctions } from './src/modules/users/functions';

// A tabela é criada pelo stack infra/<projeto> (não aqui).
// Deploy via serverless-compose.ts → param tableName = output TableName do <projeto>-infra.
// Dev local (serverless offline fora do compose) → fallback custom.localTableName.
const tableName = '${param:tableName, self:custom.localTableName}';

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
    ...authFunctions,
    ...usersFunctions,
    ...notificationsFunctions,
  },
};

export default config;
