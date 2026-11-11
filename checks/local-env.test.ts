// Ambiente local (plano 009): DynamoDB Local + dynamodb-admin no lugar do LocalStack.
// Imagens com versão fixa, nenhum serviço `localstack`, o `app` aponta para `http://dynamodb:8000`
// e as portas 8000/8001 saem pelo `ports:` do compose, nunca pelo `forwardPorts` do devcontainer: o VS Code
// só encaminha portas do container `app`, e com a porta já publicada pelo Docker ele cai numa porta aleatória.
import { describe, expect, it } from 'vitest';
import { read } from './lib';

const COMPOSE = '.devcontainer/docker-compose.yml';
const DEVCONTAINER = '.devcontainer/devcontainer.json';

interface Service {
  name: string;
  lines: string[];
}

/** Serviços de `services:` do compose (parser mínimo por indentação, sem dependência de yaml). */
function services(compose: string): Service[] {
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

function imageOf(service: Service): string | undefined {
  const line = service.lines.find((l) => /^\s+image:/.test(l));
  return line
    ?.replace(/^\s+image:\s*/, '')
    .replace(/["']/g, '')
    .trim();
}

function envOf(service: Service, key: string): string | undefined {
  const re = new RegExp(`^\\s+-?\\s*${key}\\s*[:=]\\s*(.*)$`);
  const line = service.lines.find((l) => re.test(l));
  return line?.match(re)?.[1]?.replace(/["']/g, '').trim();
}

/** Tag fixa: presente, diferente de `latest` e com número de versão. */
function pinned(image: string, repo: string): boolean {
  if (!image.startsWith(`${repo}:`)) return false;
  const tag = image.slice(repo.length + 1);
  return tag !== 'latest' && /^\d+(\.\d+)*$/.test(tag);
}

function composeViolations(compose: string): string[] {
  const list = services(compose);
  const images = list.map((s) => ({ name: s.name, image: imageOf(s) ?? '' }));
  const required = ['amazon/dynamodb-local', 'aaronshaf/dynamodb-admin'].flatMap((repo) => {
    const found = images.filter((i) => i.image === repo || i.image.startsWith(`${repo}:`));
    if (!found.length) return [`nenhum serviço usa a imagem \`${repo}\``];
    return found
      .filter((i) => !pinned(i.image, repo))
      .map((i) => `${i.name}: imagem \`${i.image}\` sem versão fixa`);
  });
  const localstack = images
    .filter((i) => /localstack/i.test(i.name) || /localstack/i.test(i.image))
    .map((i) => `${i.name}: serviço localstack no compose`);
  const app = list.find((s) => s.name === 'app');
  const endpoint = app ? envOf(app, 'DYNAMODB_ENDPOINT') : undefined;
  const appViolations = !app
    ? ['serviço `app` não encontrado']
    : endpoint === 'http://dynamodb:8000'
      ? []
      : [`app: DYNAMODB_ENDPOINT é \`${endpoint}\` (esperado \`http://dynamodb:8000\`)`];
  return [...required, ...localstack, ...appViolations];
}

interface DevContainer {
  forwardPorts?: (number | string)[];
  portsAttributes?: Record<string, unknown>;
}

/** Portas de serviços fora do `app`: publicadas pelo compose e ausentes do devcontainer. */
function devcontainerViolations(config: DevContainer, compose: string): string[] {
  const forwarded = (config.forwardPorts ?? []).map(String);
  const attributes = Object.keys(config.portsAttributes ?? {});
  const inDevcontainer = ['8000', '8001', '4566'].flatMap((p) => [
    ...(forwarded.includes(p)
      ? [`porta ${p} em forwardPorts (é de outro container: use o ports: do compose)`]
      : []),
    ...(attributes.includes(p) ? [`porta ${p} em portsAttributes`] : []),
  ]);
  const unpublished = ['8000', '8001']
    .filter((p) => !compose.includes(`:${p}"`))
    .map((p) => `porta ${p} não publicada no compose`);
  return [...inDevcontainer, ...unpublished];
}

describe('ambiente local: DynamoDB Local', () => {
  it('caso 6: compose com dynamodb-local e dynamodb-admin fixos, sem localstack, app → dynamodb:8000', () => {
    expect(composeViolations(read(COMPOSE))).toEqual([]);
  });
  it('caso 6: 8000 e 8001 publicadas pelo compose, fora do devcontainer (e sem a 4566)', () => {
    expect(devcontainerViolations(JSON.parse(read(DEVCONTAINER)) as DevContainer, read(COMPOSE))).toEqual([]);
  });
});

describe('ambiente local: os checks pegam a violação plantada', () => {
  const good = [
    'name: x',
    '',
    'services:',
    '  app:',
    '    image: node:22',
    '    environment:',
    '      DYNAMODB_ENDPOINT: http://dynamodb:8000',
    '    depends_on:',
    '      - dynamodb',
    '',
    '  dynamodb:',
    '    image: amazon/dynamodb-local:3.3.2',
    '    command: "-jar DynamoDBLocal.jar -sharedDb -dbPath /data"',
    '',
    '  dynamodb-admin:',
    '    image: aaronshaf/dynamodb-admin:5.3.4',
    '    environment:',
    '      DYNAMO_ENDPOINT: http://dynamodb:8000',
    '',
    'volumes:',
    '  dynamodb-data:',
  ].join('\n');

  it('caso 6: compose certo passa', () => {
    expect(composeViolations(good)).toEqual([]);
  });
  it('caso 6: imagem com latest ou sem tag', () => {
    expect(
      composeViolations(good.replace('amazon/dynamodb-local:3.3.2', 'amazon/dynamodb-local:latest')),
    ).toHaveLength(1);
    expect(
      composeViolations(good.replace('aaronshaf/dynamodb-admin:5.3.4', 'aaronshaf/dynamodb-admin')),
    ).toHaveLength(1);
  });
  it('caso 6: imagem ausente', () => {
    expect(composeViolations(good.replace('aaronshaf/dynamodb-admin:5.3.4', 'other/admin:1.0'))).toHaveLength(
      1,
    );
  });
  it('caso 6: serviço localstack', () => {
    const withLocalstack = good.replace(
      '\nvolumes:',
      '  localstack:\n    image: localstack/localstack:4.9\n\nvolumes:',
    );
    expect(composeViolations(withLocalstack)).toHaveLength(1);
  });
  it('caso 6: DYNAMODB_ENDPOINT do app errado', () => {
    expect(
      composeViolations(
        good.replace('DYNAMODB_ENDPOINT: http://dynamodb:8000', 'DYNAMODB_ENDPOINT: http://localstack:4566'),
      ),
    ).toHaveLength(1);
  });
  it('caso 6: portas de outros containers no devcontainer ou fora do compose falham', () => {
    const ok: DevContainer = { forwardPorts: [5173, 3010], portsAttributes: { '5173': {} } };
    const published = '      - "${DYNAMODB_PORT:-8000}:8000"\n      - "${DYNAMODB_ADMIN_PORT:-8001}:8001"';
    expect(devcontainerViolations(ok, published)).toEqual([]);
    expect(devcontainerViolations({ ...ok, forwardPorts: [5173, 8000] }, published)).toHaveLength(1);
    expect(devcontainerViolations({ ...ok, portsAttributes: { '8001': {} } }, published)).toHaveLength(1);
    expect(devcontainerViolations({ ...ok, forwardPorts: [4566] }, published)).toHaveLength(1);
    expect(devcontainerViolations(ok, '')).toHaveLength(2);
  });
});
