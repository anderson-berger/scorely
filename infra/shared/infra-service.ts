import type { AWS } from '@serverless/typescript';
import { singleTableSchema, tableNameFor, ttlAttribute } from './single-table';

/**
 * Stack de infra de um projeto: recursos com estado (tabela, e no futuro buckets, filas...).
 * Expõe os dados como CloudFormation Outputs; o serverless-compose.ts da raiz repassa
 * esses outputs para a api do projeto como params.
 */
export function createInfraService(project: string): AWS {
  return {
    service: `${project}-infra`,
    frameworkVersion: '4',
    provider: {
      name: 'aws',
      region: 'sa-east-1',
      stage: "${opt:stage, 'dev'}",
    },
    resources: {
      Resources: {
        AppTable: {
          Type: 'AWS::DynamoDB::Table',
          // Um `serverless remove` não apaga os dados
          DeletionPolicy: 'Retain',
          UpdateReplacePolicy: 'Retain',
          Properties: {
            TableName: tableNameFor(project, '${sls:stage}'),
            ...singleTableSchema,
            TimeToLiveSpecification: { AttributeName: ttlAttribute, Enabled: true },
          },
        },
      },
      Outputs: {
        TableName: { Value: { Ref: 'AppTable' } },
        TableArn: { Value: { 'Fn::GetAtt': ['AppTable', 'Arn'] } },
      },
    },
  };
}
