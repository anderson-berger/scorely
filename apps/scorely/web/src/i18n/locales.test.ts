import { en } from '@scorely/web/src/i18n/locales/en';
import { ptBR } from '@scorely/web/src/i18n/locales/pt-BR';
import { describe, expect, it } from 'vitest';

/** Caminhos de todas as folhas (`a.b.c`) de um objeto de mensagens; arrays contam como folha. */
function leafPaths(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([k, v]) => leafPaths(v, prefix ? `${prefix}.${k}` : k));
}

function at(messages: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (node, key) =>
        node !== null && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined,
      messages,
    );
}

// Chaves novas do plano 008 (D12).
const NEW_KEYS = [
  'groups.lineup',
  'groups.bench',
  'groups.youPlay',
  'groups.yourPlace',
  'groups.opensIn',
  'groups.joinWaitlist',
  'groups.wouldBeWaiting',
  'groups.layerOpensAt',
  'groups.empty',
  'groups.emptyHint',
  'groups.gotLink',
  'login.noPassword',
  'groups.linksHint',
  'groups.layerState.open',
  'groups.layerState.soon',
  'groups.layerState.off',
];

// Chaves novas do plano 012 (D9).
const TABS_KEYS = [
  'groups.tabs.game',
  'groups.tabs.members',
  'groups.tabs.settings',
  'groups.invite',
  'groups.nextLayer.reserves',
  'groups.nextLayer.guests',
  'groups.nextLayer.allOpen',
  'groups.gameSection',
];

describe('i18n: pt-BR e en', () => {
  it('caso 14: os dois idiomas têm exatamente as mesmas chaves', () => {
    expect(leafPaths(en).sort()).toEqual(leafPaths(ptBR).sort());
  });

  it.each(NEW_KEYS)('caso 14: %s existe em pt-BR e en, com texto', (key) => {
    for (const messages of [ptBR, en]) {
      const value = at(messages, key);
      expect(typeof value).toBe('string');
      expect((value as string).length).toBeGreaterThan(0);
    }
  });

  it('caso 14: groups.yourPlace e groups.wouldBeWaiting usam {position}', () => {
    for (const messages of [ptBR, en]) {
      expect(at(messages, 'groups.yourPlace')).toContain('{position}');
      expect(at(messages, 'groups.wouldBeWaiting')).toContain('{position}');
    }
  });

  it('caso 14: weekdaysShort tem os 7 dias em pt-BR e en', () => {
    for (const messages of [ptBR, en]) {
      const days = at(messages, 'weekdaysShort');
      expect(Array.isArray(days)).toBe(true);
      expect(days).toHaveLength(7);
    }
  });
});

describe('i18n: abas do grupo (plano 012)', () => {
  it.each(TABS_KEYS)('caso 13: %s existe em pt-BR e en, com texto', (key) => {
    for (const messages of [ptBR, en]) {
      const value = at(messages, key);
      expect(typeof value).toBe('string');
      expect((value as string).length).toBeGreaterThan(0);
    }
  });

  it('caso 13: groups.nextLayer.reserves e .guests usam {date}', () => {
    for (const messages of [ptBR, en]) {
      expect(at(messages, 'groups.nextLayer.reserves')).toContain('{date}');
      expect(at(messages, 'groups.nextLayer.guests')).toContain('{date}');
    }
  });

  it('caso 13: groups.youAreOwner sai das duas línguas (D8)', () => {
    expect(at(ptBR, 'groups.youAreOwner')).toBeUndefined();
    expect(at(en, 'groups.youAreOwner')).toBeUndefined();
  });
});

// Plano 013 (D8).
const NAV_KEYS = ['nav.groups', 'nav.profile', 'nav.logout', 'nav.open', 'groups.backToGroups'];
const REMOVED_NAV_KEYS = [
  'layout.profile',
  'layout.logout',
  'groups.back',
  'groups.backHome',
  'home.myGroups',
];

describe('i18n: menu lateral e tela de Grupos (plano 013)', () => {
  it.each(NAV_KEYS)('caso 7: %s existe em pt-BR e en, com texto', (key) => {
    for (const messages of [ptBR, en]) {
      const value = at(messages, key);
      expect(typeof value).toBe('string');
      expect((value as string).length).toBeGreaterThan(0);
    }
  });

  it('caso 7: textos em pt-BR (D8)', () => {
    expect(at(ptBR, 'nav.groups')).toBe('Grupos');
    expect(at(ptBR, 'nav.profile')).toBe('Perfil');
    expect(at(ptBR, 'nav.logout')).toBe('Sair');
    expect(at(ptBR, 'nav.open')).toBe('Abrir menu');
    expect(at(ptBR, 'groups.backToGroups')).toBe('Ver grupos');
  });

  it.each(REMOVED_NAV_KEYS)('caso 7: %s sai das duas línguas', (key) => {
    expect(at(ptBR, key)).toBeUndefined();
    expect(at(en, key)).toBeUndefined();
  });
});

describe('i18n: estado vazio vai de home.* para groups.* (plano 013, D8)', () => {
  it('caso 7: groups.empty, groups.emptyHint e groups.gotLink mantêm o texto em pt-BR', () => {
    expect(at(ptBR, 'groups.empty')).toBe('Nenhum grupo ainda');
    expect(at(ptBR, 'groups.emptyHint')).toBe('Crie o seu ou peça o link de convite a quem organiza o jogo.');
    expect(at(ptBR, 'groups.gotLink')).toBe('Recebeu um link? É só abrir que você entra.');
  });

  it.each(['home.empty', 'home.emptyHint', 'home.gotLink'])('caso 7: %s sai das duas línguas', (key) => {
    expect(at(ptBR, key)).toBeUndefined();
    expect(at(en, key)).toBeUndefined();
  });
});

// Plano 014 (D9). groups.owned e groups.joined (plano 013) viram abas.
const GROUPS_TABS_KEYS = [
  'groups.tabs.next',
  'groups.tabs.owned',
  'groups.tabs.joined',
  'groups.newGroup',
  'groups.scoreLegend',
  'groups.card.cancelled',
  'groups.card.inProgress',
  'groups.card.playing',
  'groups.card.waiting',
  'groups.card.opens',
  'groups.card.spots',
  'groups.card.full',
  'groups.emptyOwned',
  'groups.emptyJoined',
];

describe('i18n: tela de Grupos em abas (plano 014)', () => {
  it.each(GROUPS_TABS_KEYS)('caso 15: %s existe em pt-BR e en, com texto', (key) => {
    for (const messages of [ptBR, en]) {
      const value = at(messages, key);
      expect(typeof value).toBe('string');
      expect((value as string).length).toBeGreaterThan(0);
    }
  });

  it('caso 15: textos das abas em pt-BR', () => {
    expect(at(ptBR, 'groups.tabs.next')).toBe('Próximos jogos');
    expect(at(ptBR, 'groups.tabs.owned')).toBe('Meus grupos');
    expect(at(ptBR, 'groups.tabs.joined')).toBe('Participo');
    expect(at(ptBR, 'groups.newGroup')).toBe('Novo grupo');
    expect(at(ptBR, 'groups.scoreLegend')).toBe('confirmados · vagas');
  });

  it.each(['groups.owned', 'groups.joined'])('caso 15: %s sai das duas línguas', (key) => {
    expect(at(ptBR, key)).toBeUndefined();
    expect(at(en, key)).toBeUndefined();
  });

  it('caso 15: playing/waiting usam {position}, opens usa {date}, spots usa {count}', () => {
    for (const messages of [ptBR, en]) {
      expect(at(messages, 'groups.card.playing')).toContain('{position}');
      expect(at(messages, 'groups.card.waiting')).toContain('{position}');
      expect(at(messages, 'groups.card.opens')).toContain('{date}');
      expect(at(messages, 'groups.card.spots')).toContain('{count}');
    }
  });
});

// Plano 015 (D13). groups.roster, groups.score.* e groups.countdown.* saíram de NEW_KEYS (plano 008).
const GROUP_PAGE_KEYS = [
  'groups.lineupCount',
  'groups.benchCount',
  'groups.waitingSuffix',
  'groups.confirmFrom',
  'groups.youPlayAt',
  'groups.youWaitAt',
  'groups.spotsLeft',
  'groups.reservesSection',
  'groups.membersSection',
  'groups.settings.layers',
  'groups.settings.danger',
  'groups.settings.dangerHint',
];
const REMOVED_GROUP_PAGE_KEYS = [
  'groups.game',
  'groups.notifyWhenOpens',
  'groups.youCanConfirmAt',
  'groups.countdown',
  'groups.roster',
  'groups.score',
  // Correção do dono no plano 015: sem caminho "Grupos / nome" (D3 saiu).
  'groups.breadcrumb',
];

describe('i18n: página do grupo com capa (plano 015)', () => {
  it.each(GROUP_PAGE_KEYS)('caso 9: %s existe em pt-BR e en, com texto', (key) => {
    for (const messages of [ptBR, en]) {
      const value = at(messages, key);
      expect(typeof value).toBe('string');
      expect((value as string).length).toBeGreaterThan(0);
    }
  });

  it.each(REMOVED_GROUP_PAGE_KEYS)('caso 9: %s sai das duas línguas', (key) => {
    expect(at(ptBR, key)).toBeUndefined();
    expect(at(en, key)).toBeUndefined();
  });

  it.each([
    'groups.lineupCount',
    'groups.benchCount',
    'groups.waitingSuffix',
    'groups.spotsLeft',
    'groups.reservesSection',
    'groups.membersSection',
  ])('caso 9: %s usa {count}', (key) => {
    for (const messages of [ptBR, en]) {
      expect(at(messages, key)).toContain('{count}');
    }
  });

  it('caso 9: groups.confirmFrom usa {date}', () => {
    for (const messages of [ptBR, en]) {
      expect(at(messages, 'groups.confirmFrom')).toContain('{date}');
    }
  });

  it.each(['groups.youPlayAt', 'groups.youWaitAt'])('caso 9: %s usa {position}', (key) => {
    for (const messages of [ptBR, en]) {
      expect(at(messages, key)).toContain('{position}');
    }
  });

  it('caso 9: textos em pt-BR (D13)', () => {
    expect(at(ptBR, 'groups.lineupCount')).toBe('Escalação · {count}');
    expect(at(ptBR, 'groups.benchCount')).toBe('Banco · {count}');
    expect(at(ptBR, 'groups.waitingSuffix')).toBe(' · {count} na fila');
    expect(at(ptBR, 'groups.confirmFrom')).toBe('Confirme a partir de {date}');
    expect(at(ptBR, 'groups.youPlayAt')).toBe('Você joga · {position}º da lista');
    expect(at(ptBR, 'groups.youWaitAt')).toBe('Na fila · {position}º');
    expect(at(ptBR, 'groups.spotsLeft')).toBe('Sobra {count} vaga | Sobram {count} vagas');
    expect(at(ptBR, 'groups.reservesSection')).toBe('Reservas · {count}/{max}');
    expect(at(ptBR, 'groups.membersSection')).toBe('Membros · {count}/{max}');
  });
});

// Plano 015, ajuste do espaço vazio (D14).
describe('i18n: vagas da escalação (plano 015, D14)', () => {
  it.each(['groups.freeSlot', 'groups.moreFreeSlots'])(
    'caso 17: %s existe em pt-BR e en, com texto',
    (key) => {
      for (const messages of [ptBR, en]) {
        const value = at(messages, key);
        expect(typeof value).toBe('string');
        expect((value as string).length).toBeGreaterThan(0);
      }
    },
  );

  it('caso 17: groups.moreFreeSlots usa {count}', () => {
    for (const messages of [ptBR, en]) {
      expect(at(messages, 'groups.moreFreeSlots')).toContain('{count}');
    }
  });

  it('caso 17: textos em pt-BR', () => {
    expect(at(ptBR, 'groups.freeSlot')).toBe('vaga');
    expect(at(ptBR, 'groups.moreFreeSlots')).toBe('+ {count} vaga livre | + {count} vagas livres');
  });
});
