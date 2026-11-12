import { publicBaseUrl } from '@scorely/api/src/lib/storage';
import { describe, expect, it } from 'vitest';

const BUCKET = 'scorely-dev-uploads';

describe('publicBaseUrl', () => {
  it('caso 11: com S3_PUBLIC_ENDPOINT → path style <endpoint>/<bucket>', () => {
    expect(
      publicBaseUrl({ bucket: BUCKET, region: 'sa-east-1', publicEndpoint: 'http://localhost:9090' }),
    ).toBe('http://localhost:9090/scorely-dev-uploads');
  });

  it('caso 11: endpoint com barra no fim não gera barra dupla', () => {
    expect(
      publicBaseUrl({ bucket: BUCKET, region: 'sa-east-1', publicEndpoint: 'http://localhost:9090/' }),
    ).toBe('http://localhost:9090/scorely-dev-uploads');
  });

  it('caso 11: sem endpoint → https://<bucket>.s3.sa-east-1.amazonaws.com', () => {
    expect(publicBaseUrl({ bucket: 'scorely-prod-uploads-123', region: 'sa-east-1' })).toBe(
      'https://scorely-prod-uploads-123.s3.sa-east-1.amazonaws.com',
    );
  });
});
