// Mídia (docs/modules/midia.md, MID-12 e MID-13; antes plano 010, caso 14): bucket de uploads no stack de
// infra do scorely, leitura pública só em `public/*`, limpeza do `tmp/`, outputs; IAM da api só em `tmp/*` e
// `public/*`, no ARN montado; prefixos da api iguais aos da infra; S3Mock local.
import { join } from 'node:path';
import { ROOT, read } from '@checks/lib';
import { describe, expect, it } from 'vitest';

interface CfnResource {
  Type?: string;
  Properties?: Record<string, unknown>;
}

interface InfraConfig {
  resources?: { Resources?: Record<string, CfnResource>; Outputs?: Record<string, unknown> };
}

interface Statement {
  Effect?: string;
  Action?: string[] | string;
  Resource?: unknown;
  Principal?: unknown;
}

interface IamConfig {
  provider: { iam?: { role?: { statements?: Statement[] } } };
}

async function loadInfra(project: string): Promise<InfraConfig> {
  const mod = (await import(join(ROOT, 'infra', project, 'serverless.ts'))) as { default: InfraConfig };
  return mod.default;
}

async function loadApi(project: string): Promise<IamConfig> {
  const mod = (await import(join(ROOT, 'apps', project, 'api', 'serverless.ts'))) as { default: IamConfig };
  return mod.default;
}

const actionsOf = (s: Statement): string[] =>
  Array.isArray(s.Action) ? s.Action : s.Action ? [s.Action] : [];

function infraViolations(config: InfraConfig): string[] {
  const resources = Object.values(config.resources?.Resources ?? {});
  const outputs = Object.keys(config.resources?.Outputs ?? {});
  const bucket = resources.some((r) => r.Type === 'AWS::S3::Bucket') ? [] : ['nenhum `AWS::S3::Bucket`'];
  const policies = resources.filter((r) => r.Type === 'AWS::S3::BucketPolicy');
  const statements = policies.flatMap(
    (p) =>
      ((p.Properties?.PolicyDocument as { Statement?: Statement[] } | undefined)?.Statement ??
        []) as Statement[],
  );
  const publicRead = statements.filter(
    (s) =>
      s.Effect === 'Allow' &&
      JSON.stringify(s.Principal ?? '').includes('*') &&
      actionsOf(s).includes('s3:GetObject'),
  );
  const policy = !publicRead.length
    ? ['nenhuma bucket policy com leitura pública (`s3:GetObject` para `*`)']
    : publicRead
        .filter((s) => {
          const text = JSON.stringify(s.Resource ?? '');
          return !text.includes('/public/*') || /[^c]\/\*"/.test(text);
        })
        .map(() => 'leitura pública fora de `public/*`');
  const missingOutputs = ['UploadsBucketName', 'UploadsPublicUrl']
    .filter((o) => !outputs.includes(o))
    .map((o) => `output \`${o}\` ausente`);
  return [...bucket, ...lifecycleViolations(resources), ...policy, ...missingOutputs];
}

const S3_ACTIONS = ['s3:PutObject', 's3:GetObject', 's3:DeleteObject'];

/** Todo sufixo de ARN com `*` é `/tmp/*` ou `/public/*` (nunca o bucket inteiro nem outro prefixo). */
function onlyMediaPrefixes(resourceJson: string): boolean {
  const suffixes = [...resourceJson.matchAll(/"(\/[^"]*\*)"/g)].map((m) => m[1]);
  return suffixes.length > 0 && suffixes.every((s) => s === '/tmp/*' || s === '/public/*');
}

/** MID-13: o bucket apaga sozinho o que fica em `tmp/`. */
function lifecycleViolations(resources: CfnResource[]): string[] {
  const buckets = resources.filter((r) => r.Type === 'AWS::S3::Bucket');
  return buckets.flatMap((b) => {
    const rules =
      (b.Properties?.LifecycleConfiguration as { Rules?: Record<string, unknown>[] } | undefined)?.Rules ??
      [];
    const tmp = rules.some(
      (r) => r.Status === 'Enabled' && r.Prefix === 'tmp/' && typeof r.ExpirationInDays === 'number',
    );
    return tmp ? [] : ['bucket sem regra de lifecycle que expira `tmp/`'];
  });
}

/** Os prefixos da api (`lib/storage.ts`) são os mesmos da infra (`uploads-bucket.ts`). */
function prefixViolations(api: string, infra: string): string[] {
  return ["public: 'public/'", "tmp: 'tmp/'"].flatMap((p) => [
    ...(api.includes(p) ? [] : [`api sem \`${p}\``]),
    ...(infra.includes(p) ? [] : [`infra sem \`${p}\``]),
  ]);
}

function iamViolations(config: IamConfig): string[] {
  const statements = config.provider.iam?.role?.statements ?? [];
  return S3_ACTIONS.flatMap((action) => {
    const found = statements.filter((s) => actionsOf(s).includes(action));
    if (!found.length) return [`IAM sem \`${action}\``];
    return found.flatMap((s) => {
      const text = JSON.stringify(s.Resource ?? '');
      return [
        ...(text.includes('Fn::GetAtt') ? [`\`${action}\` com Fn::GetAtt`] : []),
        ...(text.includes('arn:aws:s3:::') && onlyMediaPrefixes(text)
          ? []
          : [`\`${action}\` fora de \`arn:aws:s3:::<bucket>/{tmp,public}/*\``]),
      ];
    });
  });
}

/** Linhas de cada serviço do compose (mesmo parser mínimo de `local-env.test.ts`). */
function services(compose: string): { name: string; lines: string[] }[] {
  const lines = compose.split('\n');
  const start = lines.findIndex((l) => /^services:\s*$/.test(l));
  if (start < 0) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^\S/.test(l));
  const body = end < 0 ? rest : rest.slice(0, end);
  const heads = body.flatMap((l, i) => {
    const m = l.match(/^ {2}([\w.-]+):\s*$/);
    return m ? [{ name: m[1] as string, at: i }] : [];
  });
  return heads.map((h, i) => ({
    name: h.name,
    lines: body.slice(h.at + 1, heads[i + 1]?.at ?? body.length),
  }));
}

function composeViolations(compose: string): string[] {
  const list = services(compose);
  const images = list.flatMap((s) =>
    s.lines
      .filter((l) => /^\s+image:/.test(l))
      .map((l) => ({
        name: s.name,
        image: l
          .replace(/^\s+image:\s*/, '')
          .replace(/["']/g, '')
          .trim(),
      })),
  );
  const s3mock = images.filter((i) => i.image.startsWith('adobe/s3mock'));
  const image = !s3mock.length
    ? ['nenhum serviço usa `adobe/s3mock`']
    : s3mock
        .filter((i) => !/^adobe\/s3mock:\d+(\.\d+)*$/.test(i.image))
        .map((i) => `${i.name}: \`${i.image}\` sem versão fixa`);
  const app = list.find((s) => s.name === 'app');
  const env = (key: string) => app?.lines.some((l) => new RegExp(`^\\s+-?\\s*${key}\\s*[:=]\\s*\\S`).test(l));
  const appEnv = !app
    ? ['serviço `app` não encontrado']
    : ['S3_ENDPOINT', 'S3_PUBLIC_ENDPOINT'].filter((k) => !env(k)).map((k) => `app sem \`${k}\``);
  return [...image, ...appEnv];
}

/** A 9090 é do container `s3`: sai pelo `ports:` do compose, nunca pelo `forwardPorts` (só encaminha o `app`). */
function devcontainerViolations(config: { forwardPorts?: (number | string)[] }, compose: string): string[] {
  return [
    ...((config.forwardPorts ?? []).map(String).includes('9090') ? ['porta 9090 em forwardPorts'] : []),
    ...(compose.includes(':9090"') ? [] : ['porta 9090 não publicada no compose']),
  ];
}

describe('uploads (mídia)', () => {
  it('caso 14: stack de infra do scorely tem bucket, policy pública só em public/*, limpeza do tmp/ e os outputs', async () => {
    expect(infraViolations(await loadInfra('scorely'))).toEqual([]);
  });
  it('caso 14: IAM da api tem PutObject/GetObject/DeleteObject só em tmp/* e public/* com ARN montado', async () => {
    expect(iamViolations(await loadApi('scorely'))).toEqual([]);
  });
  it('MID-12/MID-13: os prefixos da api são os mesmos da infra', () => {
    expect(
      prefixViolations(read('apps/scorely/api/src/lib/storage.ts'), read('infra/shared/uploads-bucket.ts')),
    ).toEqual([]);
  });
  it('caso 14: compose com adobe/s3mock fixo e app com S3_ENDPOINT/S3_PUBLIC_ENDPOINT', () => {
    expect(composeViolations(read('.devcontainer/docker-compose.yml'))).toEqual([]);
  });
  it('caso 14: 9090 publicada pelo compose, fora do devcontainer', () => {
    expect(
      devcontainerViolations(
        JSON.parse(read('.devcontainer/devcontainer.json')),
        read('.devcontainer/docker-compose.yml'),
      ),
    ).toEqual([]);
  });
});

describe('uploads: os checks pegam a violação plantada', () => {
  const policy = (resource: unknown): CfnResource => ({
    Type: 'AWS::S3::BucketPolicy',
    Properties: {
      PolicyDocument: {
        Statement: [{ Effect: 'Allow', Principal: '*', Action: ['s3:GetObject'], Resource: resource }],
      },
    },
  });
  const good: InfraConfig = {
    resources: {
      Resources: {
        Uploads: {
          Type: 'AWS::S3::Bucket',
          Properties: {
            LifecycleConfiguration: {
              Rules: [{ Status: 'Enabled', Prefix: 'tmp/', ExpirationInDays: 1 }],
            },
          },
        },
        Policy: policy({ 'Fn::Join': ['', ['arn:aws:s3:::', { Ref: 'Uploads' }, '/public/*']] }),
      },
      Outputs: { UploadsBucketName: {}, UploadsPublicUrl: {} },
    },
  };

  it('caso 14: infra certa passa', () => {
    expect(infraViolations(good)).toEqual([]);
  });
  it('caso 14: leitura pública no bucket inteiro', () => {
    const wide = {
      resources: {
        ...good.resources,
        Resources: { ...good.resources?.Resources, Policy: policy('arn:aws:s3:::b/*') },
      },
    };
    expect(infraViolations(wide)).toHaveLength(1);
  });
  it('MID-13: bucket sem a limpeza do tmp/', () => {
    const noLifecycle = {
      resources: {
        ...good.resources,
        Resources: { ...good.resources?.Resources, Uploads: { Type: 'AWS::S3::Bucket' } },
      },
    };
    expect(infraViolations(noLifecycle)).toEqual(['bucket sem regra de lifecycle que expira `tmp/`']);
  });
  it('MID-12: IAM no bucket inteiro ou em outro prefixo falha', () => {
    const wide = { 'Fn::Join': ['', ['arn:aws:s3:::', 'b', '/*']] };
    const other = { 'Fn::Join': ['', ['arn:aws:s3:::', 'b', '/avatars/*']] };
    for (const resource of [wide, other]) {
      const config: IamConfig = {
        provider: { iam: { role: { statements: [{ Action: S3_ACTIONS, Resource: [resource] }] } } },
      };
      expect(iamViolations(config)).toHaveLength(3);
    }
  });
  it('MID-12/MID-13: prefixo diferente entre api e infra', () => {
    expect(prefixViolations("public: 'public/', tmp: 'tmp/'", "public: 'pub/', tmp: 'tmp/'")).toEqual([
      "infra sem `public: 'public/'`",
    ]);
  });
  it('caso 14: sem bucket ou sem output', () => {
    expect(
      infraViolations({
        resources: { ...good.resources, Resources: { Policy: policy('arn:aws:s3:::b/public/*') } },
      }),
    ).toHaveLength(1);
    expect(
      infraViolations({ resources: { ...good.resources, Outputs: { UploadsBucketName: {} } } }),
    ).toHaveLength(1);
  });

  const arn = { 'Fn::Join': ['', ['arn:aws:s3:::', '${param:uploadsBucket, self:custom.x}', '/public/*']] };
  it('caso 14: IAM certo passa; ação faltando ou GetAtt falham', () => {
    const ok: IamConfig = {
      provider: { iam: { role: { statements: [{ Action: S3_ACTIONS, Resource: [arn] }] } } },
    };
    expect(iamViolations(ok)).toEqual([]);
    const missing: IamConfig = {
      provider: {
        iam: { role: { statements: [{ Action: ['s3:PutObject', 's3:GetObject'], Resource: [arn] }] } },
      },
    };
    expect(iamViolations(missing)).toHaveLength(1);
    const getAtt: IamConfig = {
      provider: {
        iam: {
          role: {
            statements: [
              {
                Action: S3_ACTIONS,
                Resource: [{ 'Fn::Join': ['', [{ 'Fn::GetAtt': ['B', 'Arn'] }, '/public/*']] }],
              },
            ],
          },
        },
      },
    };
    expect(iamViolations(getAtt).length).toBeGreaterThan(0);
  });

  const compose = [
    'services:',
    '  app:',
    '    image: node:22',
    '    environment:',
    '      S3_ENDPOINT: http://s3:9090',
    '      S3_PUBLIC_ENDPOINT: http://localhost:9090',
    '  s3:',
    '    image: adobe/s3mock:5.2.3',
    '',
    'volumes:',
    '  s3-data:',
  ].join('\n');
  it('caso 14: compose certo passa; latest ou env faltando falham', () => {
    expect(composeViolations(compose)).toEqual([]);
    expect(composeViolations(compose.replace('adobe/s3mock:5.2.3', 'adobe/s3mock:latest'))).toHaveLength(1);
    expect(
      composeViolations(compose.replace('      S3_PUBLIC_ENDPOINT: http://localhost:9090\n', '')),
    ).toHaveLength(1);
  });
  it('caso 14: 9090 no devcontainer ou fora do compose falha', () => {
    const published = '      - "${S3_PORT:-9090}:9090"';
    expect(devcontainerViolations({ forwardPorts: [3010] }, published)).toEqual([]);
    expect(devcontainerViolations({ forwardPorts: [3010, 9090] }, published)).toHaveLength(1);
    expect(devcontainerViolations({ forwardPorts: [3010] }, '')).toHaveLength(1);
  });
});
