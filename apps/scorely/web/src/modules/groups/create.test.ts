import { describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { en } from '@/i18n/locales/en';
import { ptBR } from '@/i18n/locales/pt-BR';
import { groupsRoutes } from './routes';

/** Mesmo encaixe do `app/router.ts`: as rotas de grupos são filhas de `/`. */
function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { render: () => null }, children: groupsRoutes }],
  });
}

const textAt = (messages: unknown, path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>(
      (node, key) =>
        node !== null && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined,
      messages,
    );

describe('criar grupo é um painel (GRP-34)', () => {
  it('GRP-34: /groups/new é group-create, filha da tela de Grupos (o painel abre por cima dela)', () => {
    const router = makeRouter();
    const groupsRecord = router.resolve({ name: 'groups' }).matched.at(-1);
    expect(groupsRecord).toBeDefined();
    const create = router.resolve('/groups/new');
    expect(create.name).toBe('group-create');
    expect(create.matched).toContain(groupsRecord);
    expect(create.matched.at(-1)).not.toBe(groupsRecord);
  });

  it('GRP-34: abrir o painel mantém a aba da tela de Grupos na query', () => {
    const router = makeRouter();
    const resolved = router.resolve({ name: 'group-create', query: { tab: 'archived' } });
    expect(resolved.fullPath).toBe('/groups/new?tab=archived');
  });

  it('GRP-34: fechar o painel volta para /groups, ainda com a aba', () => {
    const router = makeRouter();
    expect(router.resolve({ name: 'groups', query: { tab: 'archived' } }).fullPath).toBe(
      '/groups?tab=archived',
    );
  });

  it('GRP-34: /groups/:id continua sendo a página do grupo (new não vira id)', () => {
    const router = makeRouter();
    expect(router.resolve('/groups/g1').name).toBe('group');
    expect(router.resolve('/groups/new').params).not.toHaveProperty('id');
  });

  it('GRP-34: o aviso ao criar ("abertura da lista nos Ajustes") existe em pt-BR e en', () => {
    for (const messages of [ptBR, en]) {
      const text = textAt(messages, 'groups.createdHint');
      expect(typeof text).toBe('string');
      expect((text as string).length).toBeGreaterThan(0);
    }
  });
});
