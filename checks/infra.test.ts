// Regras de infra (.claude/rules/infra.md): a api não declara recursos, todo `${param:}` tem fallback
// para o dev local e o IAM não usa `Fn::GetAtt` (o recurso está em outro stack).
import { describe, expect, it } from 'vitest';
import { type ApiConfig, loadConfig, projects } from './lib';

function resourcesViolations(config: Pick<ApiConfig, 'resources'>): string[] {
  return config.resources === undefined ? [] : ['serverless.ts da api declara `resources`'];
}

function paramWithoutFallback(config: unknown): string[] {
  const text = JSON.stringify(config);
  return [...text.matchAll(/\$\{param:([^}]*)\}/g)]
    .filter((m) => !m[1]?.includes(','))
    .map((m) => `\`${m[0]}\` sem fallback (use \`\${param:x, self:custom.localX}\`)`);
}

function getAttViolations(config: unknown): string[] {
  return JSON.stringify(config).includes('Fn::GetAtt')
    ? ['`Fn::GetAtt` na api: monte o ARN com `Fn::Join` (o recurso está no stack de infra)']
    : [];
}

describe.each(projects())('infra: %s/api', (project) => {
  it('não declara resources', async () => {
    expect(resourcesViolations(await loadConfig(project))).toEqual([]);
  });
  it('todo ${param:...} tem fallback', async () => {
    expect(paramWithoutFallback(await loadConfig(project))).toEqual([]);
  });
  it('não usa Fn::GetAtt', async () => {
    expect(getAttViolations(await loadConfig(project))).toEqual([]);
  });
});

describe('infra: os checks pegam a violação plantada', () => {
  it('resources', () => {
    expect(resourcesViolations({ resources: { Resources: {} } })).toHaveLength(1);
  });
  it('param sem fallback', () => {
    expect(paramWithoutFallback({ env: { T: '${param:tableName}' } })).toHaveLength(1);
    expect(paramWithoutFallback({ env: { T: '${param:tableName, self:custom.x}' } })).toEqual([]);
  });
  it('GetAtt', () => {
    expect(getAttViolations({ Resource: [{ 'Fn::GetAtt': ['AppTable', 'Arn'] }] })).toHaveLength(1);
  });
});
