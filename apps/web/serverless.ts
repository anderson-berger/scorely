import type { AWS } from '@serverless/typescript';

const serverlessConfiguration = {
  service: 'scorely-web',
  frameworkVersion: '4',

  provider: {
    name: 'aws',
    region: 'sa-east-1',
    stage: '${opt:stage, "dev"}',
  },

  plugins: ['serverless-s3-sync'],

  custom: {
    bucketName: '${self:service}-${self:provider.stage}',
    apiEndpoint: '${env:API_GATEWAY_ENDPOINT, "https://api.example.com"}',
    s3Sync: [
      {
        bucketName: '${self:custom.bucketName}',
        localDir: 'dist/spa',
        deleteRemoved: true,
        params: [
          { 'index.html': { CacheControl: 'no-cache' } },
          { '*.js': { CacheControl: 'max-age=31536000' } },
          { '*.css': { CacheControl: 'max-age=31536000' } },
        ],
      },
    ],
  },

  resources: {
    Resources: {
      // S3 Bucket para arquivos estáticos
      WebAppBucket: {
        Type: 'AWS::S3::Bucket',
        Properties: {
          BucketName: '${self:custom.bucketName}',
          PublicAccessBlockConfiguration: {
            BlockPublicAcls: true,
            BlockPublicPolicy: true,
            IgnorePublicAcls: true,
            RestrictPublicBuckets: true,
          },
        },
      },

      // Origin Access Control - permite CloudFront acessar S3 privado
      CloudFrontOAC: {
        Type: 'AWS::CloudFront::OriginAccessControl',
        Properties: {
          OriginAccessControlConfig: {
            Name: '${self:service}-oac-${self:provider.stage}',
            OriginAccessControlOriginType: 's3',
            SigningBehavior: 'always',
            SigningProtocol: 'sigv4',
          },
        },
      },

      // Política do bucket - permite apenas CloudFront acessar
      WebAppBucketPolicy: {
        Type: 'AWS::S3::BucketPolicy',
        Properties: {
          Bucket: { Ref: 'WebAppBucket' },
          PolicyDocument: {
            Statement: [
              {
                Effect: 'Allow',
                Principal: { Service: 'cloudfront.amazonaws.com' },
                Action: 's3:GetObject',
                Resource: { 'Fn::Sub': '${WebAppBucket.Arn}/*' },
                Condition: {
                  StringEquals: {
                    'AWS:SourceArn': {
                      'Fn::Sub':
                        'arn:aws:cloudfront::${AWS::AccountId}:distribution/${CloudFrontDistribution}',
                    },
                  },
                },
              },
            ],
          },
        },
      },

      // CloudFront Distribution - CDN global
      CloudFrontDistribution: {
        Type: 'AWS::CloudFront::Distribution',
        Properties: {
          DistributionConfig: {
            Enabled: true,
            DefaultRootObject: 'index.html',
            HttpVersion: 'http2and3',
            PriceClass: 'PriceClass_100',

            Origins: [
              {
                Id: 'S3Origin',
                DomainName: {
                  'Fn::GetAtt': ['WebAppBucket', 'RegionalDomainName'],
                },
                S3OriginConfig: { OriginAccessIdentity: '' },
                OriginAccessControlId: { Ref: 'CloudFrontOAC' },
              },
              {
                Id: 'ApiOrigin',
                DomainName: {
                  'Fn::Select': [2, { 'Fn::Split': ['/', '${self:custom.apiEndpoint}'] }],
                },
                CustomOriginConfig: {
                  HTTPSPort: 443,
                  OriginProtocolPolicy: 'https-only',
                  OriginSSLProtocols: ['TLSv1.2'],
                },
              },
            ],

            DefaultCacheBehavior: {
              TargetOriginId: 'S3Origin',
              ViewerProtocolPolicy: 'redirect-to-https',
              AllowedMethods: ['GET', 'HEAD', 'OPTIONS'],
              CachedMethods: ['GET', 'HEAD'],
              CachePolicyId: '658327ea-f89d-4fab-a63d-7e88639e58f6',
              Compress: true,
            },

            CacheBehaviors: [
              {
                PathPattern: '/api/*',
                TargetOriginId: 'ApiOrigin',
                ViewerProtocolPolicy: 'redirect-to-https',
                AllowedMethods: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'POST', 'PATCH', 'DELETE'],
                CachePolicyId: '4135ea2d-6df8-44a3-9df3-4b5a84be39ad',
                OriginRequestPolicyId: 'b689b0a8-53d0-40ab-baf2-68738e2966ac',
              },
            ],

            CustomErrorResponses: [
              {
                ErrorCode: 403,
                ResponseCode: 200,
                ResponsePagePath: '/index.html',
                ErrorCachingMinTTL: 0,
              },
              {
                ErrorCode: 404,
                ResponseCode: 200,
                ResponsePagePath: '/index.html',
                ErrorCachingMinTTL: 0,
              },
            ],
          },
        },
      },
    },

    Outputs: {
      CloudFrontDistributionId: {
        Description: 'CloudFront Distribution ID',
        Value: { Ref: 'CloudFrontDistribution' },
        Export: { Name: '${self:service}-${self:provider.stage}-distribution-id' },
      },
      CloudFrontDomainName: {
        Description: 'CloudFront Domain Name',
        Value: { 'Fn::GetAtt': ['CloudFrontDistribution', 'DomainName'] },
        Export: { Name: '${self:service}-${self:provider.stage}-domain' },
      },
      WebAppBucketName: {
        Description: 'S3 Bucket Name',
        Value: { Ref: 'WebAppBucket' },
        Export: { Name: '${self:service}-${self:provider.stage}-bucket' },
      },
    },
  },
} as AWS;

module.exports = serverlessConfiguration;
