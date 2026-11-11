import type { AWS } from '@serverless/typescript';
import { singleTableSchema, tableNameFor, ttlAttribute } from './single-table';
import { MEDIA_PREFIXES, TMP_EXPIRATION_DAYS, uploadsBucketFor } from './uploads-bucket';

export interface InfraOptions {
  /** Bucket de uploads com leitura pública em `public/*` (módulo de mídia). */
  uploads?: boolean;
}

/**
 * Stack de infra de um projeto: recursos com estado (tabela, e no futuro buckets, filas...).
 * Expõe os dados como CloudFormation Outputs; o serverless-compose.ts da raiz repassa
 * esses outputs para a api do projeto como params.
 */
export function createInfraService(project: string, options: InfraOptions = {}): AWS {
  const uploads = options.uploads ? uploadsResources(project) : { Resources: {}, Outputs: {} };
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
        ...uploads.Resources,
      },
      Outputs: {
        TableName: { Value: { Ref: 'AppTable' } },
        TableArn: { Value: { 'Fn::GetAtt': ['AppTable', 'Arn'] } },
        ...uploads.Outputs,
      },
    },
  };
}

/**
 * Bucket de uploads: nome com AccountId (global na AWS), leitura pública só em `public/*` por
 * bucket policy (ACLs continuam bloqueadas) e CORS para o POST assinado do navegador.
 * CORS com `*`: quem protege o envio é a assinatura; troque pelo domínio da web quando existir.
 */
function uploadsResources(project: string) {
  const bucketName = {
    'Fn::Join': ['-', [uploadsBucketFor(project, '${sls:stage}'), { Ref: 'AWS::AccountId' }]],
  };
  return {
    Resources: {
      UploadsBucket: {
        Type: 'AWS::S3::Bucket',
        DeletionPolicy: 'Retain',
        UpdateReplacePolicy: 'Retain',
        Properties: {
          BucketName: bucketName,
          OwnershipControls: { Rules: [{ ObjectOwnership: 'BucketOwnerEnforced' }] },
          PublicAccessBlockConfiguration: {
            BlockPublicAcls: true,
            IgnorePublicAcls: true,
            BlockPublicPolicy: false,
            RestrictPublicBuckets: false,
          },
          CorsConfiguration: {
            CorsRules: [
              { AllowedMethods: ['POST', 'GET'], AllowedOrigins: ['*'], AllowedHeaders: ['*'], MaxAge: 3000 },
            ],
          },
          // MID-13: envio nunca confirmado some sozinho
          LifecycleConfiguration: {
            Rules: [
              {
                Id: 'ExpireTmpUploads',
                Status: 'Enabled',
                Prefix: MEDIA_PREFIXES.tmp,
                ExpirationInDays: TMP_EXPIRATION_DAYS,
              },
            ],
          },
        },
      },
      UploadsBucketPolicy: {
        Type: 'AWS::S3::BucketPolicy',
        Properties: {
          Bucket: { Ref: 'UploadsBucket' },
          PolicyDocument: {
            Version: '2012-10-17',
            Statement: [
              {
                Sid: 'PublicReadMedia',
                Effect: 'Allow',
                Principal: '*',
                Action: ['s3:GetObject'],
                Resource: {
                  'Fn::Join': ['', ['arn:aws:s3:::', { Ref: 'UploadsBucket' }, `/${MEDIA_PREFIXES.public}*`]],
                },
              },
            ],
          },
        },
      },
    },
    Outputs: {
      UploadsBucketName: { Value: { Ref: 'UploadsBucket' } },
      UploadsPublicUrl: {
        Value: {
          'Fn::Join': [
            '',
            ['https://', { Ref: 'UploadsBucket' }, '.s3.', { Ref: 'AWS::Region' }, '.amazonaws.com'],
          ],
        },
      },
    },
  };
}
