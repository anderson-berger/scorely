import { describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { groupsRoutes } from './routes';

/** Mesmo encaixe do `app/router.ts`: as rotas de grupos são filhas de `/`. */
function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { render: () => null }, children: groupsRoutes }],
  });
}

const id = 'g1';

describe('rotas das abas do grupo', () => {
  it('caso 12: group, group-members e group-settings são filhas de groups/:id', () => {
    const parent = groupsRoutes.find((r) => r.path === 'groups/:id');
    expect(parent).toBeDefined();
    const names = (parent?.children ?? []).map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(['group', 'group-members', 'group-settings']));
  });

  it('caso 12: { name: group } resolve para /groups/:id', () => {
    const resolved = makeRouter().resolve({ name: 'group', params: { id } });
    expect(resolved.path).toBe(`/groups/${id}`);
    expect(resolved.matched.length).toBeGreaterThanOrEqual(3);
  });

  it('caso 12: { name: group-members } resolve para /groups/:id/members', () => {
    const router = makeRouter();
    expect(router.resolve({ name: 'group-members', params: { id } }).path).toBe(`/groups/${id}/members`);
    expect(router.resolve(`/groups/${id}/members`).name).toBe('group-members');
  });

  it('caso 12: { name: group-settings } resolve para /groups/:id/settings', () => {
    const router = makeRouter();
    expect(router.resolve({ name: 'group-settings', params: { id } }).path).toBe(`/groups/${id}/settings`);
    expect(router.resolve(`/groups/${id}/settings`).name).toBe('group-settings');
  });
});

describe('tela de Grupos (plano 013)', () => {
  it('caso 6: /groups resolve para o nome groups', () => {
    const router = makeRouter();
    expect(router.resolve('/groups').name).toBe('groups');
    expect(router.resolve({ name: 'groups' }).path).toBe('/groups');
  });

  // Sem navegar de fato: o push carregaria as páginas .vue (lazy), que o vitest não compila.
  it('caso 6: / redireciona para /groups', () => {
    const router = makeRouter();
    const target = router.resolve('/').matched.at(-1)?.redirect;
    expect(target).toBeDefined();
    const resolved = router.resolve(target as Parameters<typeof router.resolve>[0]);
    expect(resolved.path).toBe('/groups');
    expect(resolved.name).toBe('groups');
  });

  it('caso 6: { name: group } continua em /groups/:id', () => {
    expect(makeRouter().resolve({ name: 'group', params: { id } }).path).toBe(`/groups/${id}`);
  });

  it('caso 6: /groups/new continua sendo group-create', () => {
    expect(makeRouter().resolve('/groups/new').name).toBe('group-create');
  });
});
