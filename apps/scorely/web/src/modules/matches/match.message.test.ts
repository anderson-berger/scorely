import type { Match, MatchEntry, PublicUserId, User } from '@scorely/contracts';
import { matchMessage } from '@scorely/web/src/modules/matches/match.message';
import { describe, expect, it } from 'vitest';

// PAR-19: a mensagem da lista para colar no WhatsApp, montada na tela.

const LINK = 'https://scorely.app/groups/K3X9PQ2A/matches/abc';
const SAO_PAULO = { groupName: 'Pelada de sexta', link: LINK, timeZone: 'America/Sao_Paulo' };

const user = (nickname: string, id: string): User => ({
  id: id as PublicUserId,
  createdAt: '2026-01-01T00:00:00.000Z',
  nickname,
});
const player = (nickname: string, id: string): MatchEntry => ({
  kind: 'player',
  user: user(nickname, id),
  tier: 'member',
});
const guest = (name: string, by: User): MatchEntry => ({
  kind: 'guest',
  guestId: '11111111-1111-4111-8111-111111111111',
  name,
  requestedBy: by,
  removable: false,
});

function match(over: Partial<Match> = {}): Match {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    startsAt: '2026-11-27T22:00:00.000Z',
    endsAt: '2026-11-28T00:00:00.000Z',
    note: 'FERIADO!',
    teams: 2,
    playersPerTeam: 6,
    status: 'open',
    wave: 'members',
    confirmed: 2,
    createdAt: '2026-11-23T10:00:00.000Z',
    version: 1,
    membersHours: 72,
    reservesHours: 24,
    closeHours: 0,
    waves: {
      members: '2026-11-24T22:00:00.000Z',
      reserves: '2026-11-26T22:00:00.000Z',
      close: '2026-11-27T22:00:00.000Z',
    },
    in: [player('Edu', '1AAAAAAA'), player('Carioca', '2BBBBBBB')],
    queue: [player('Bia', '3CCCCCCC')],
    notGoing: [{ user: user('Janice', '4DDDDDDD'), tier: 'member' }],
    guestRequests: [],
    actions: { going: true, notGoing: true, requestGuest: false, manage: false },
    ...over,
  };
}

describe('matchMessage (PAR-19)', () => {
  it('PAR-19: o cabeçalho é o grupo, o dia e a hora no fuso de quem copia, e depois o recado', () => {
    const lines = matchMessage(match(), SAO_PAULO).split('\n');
    expect(lines[0]).toMatch(/^Pelada de sexta · .*27\/11 às 19:00$/);
    expect(lines[0]).toMatch(/sex/i);
    expect(lines[1]).toBe('FERIADO!');
    expect(lines[2]).toBe('');
  });

  it('PAR-19: o dia e a hora seguem o fuso de quem copia (ADR 0006)', () => {
    expect(matchMessage(match(), { ...SAO_PAULO, timeZone: 'Europe/Lisbon' }).split('\n')[0]).toMatch(
      /27\/11 às 22:00$/,
    );
  });

  it('PAR-19: sem recado, a linha não aparece e a mensagem não tem local', () => {
    const text = matchMessage(match({ note: undefined }), SAO_PAULO);
    expect(text).not.toContain('Quadra');
    expect(text.split('\n').slice(0, 3)).toEqual([
      expect.stringContaining('27/11'),
      '',
      'Confirmados (2 de 12)',
    ]);
  });

  it('PAR-19: Confirmados mostra "n de vagas" e a lista numerada, na ordem', () => {
    const text = matchMessage(match(), SAO_PAULO);
    expect(text).toContain('Confirmados (2 de 12)\n1. Edu\n2. Carioca');
  });

  it('PAR-19: a Fila e os Não vão vêm numerados, depois dos confirmados', () => {
    const text = matchMessage(match(), SAO_PAULO);
    expect(text).toContain('Fila\n1. Bia');
    expect(text).toContain('Não vão\n1. Janice');
    expect(text.indexOf('Confirmados')).toBeLessThan(text.indexOf('Fila'));
    expect(text.indexOf('Fila')).toBeLessThan(text.indexOf('Não vão'));
  });

  it('PAR-19: o convidado sai como "Nome (convidado de Fulano)"', () => {
    const text = matchMessage(
      match({ in: [player('Edu', '1AAAAAAA'), guest('Joao', user('Carioca', '2BBBBBBB'))] }),
      SAO_PAULO,
    );
    expect(text).toContain('2. Joao (convidado de Carioca)');
  });

  it('PAR-19: a última linha leva todo mundo ao link da partida', () => {
    const lines = matchMessage(match(), SAO_PAULO).trimEnd().split('\n');
    expect(lines.at(-1)).toBe(`Confirme aqui: ${LINK}`);
    expect(lines.at(-2)).toBe('');
  });
});
