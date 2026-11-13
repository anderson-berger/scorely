import type { Game, GroupRole, GuestGame } from '@scorely/contracts';
import { inviteUrl, listGate, playRedirect } from '@scorely/web/src/modules/groups/links';
import { describe, expect, it } from 'vitest';

const origin = 'https://scorely.app';
const groupId = '11111111-1111-4111-8111-111111111111';

// Jogo sexta 2026-11-06 19:00 em São Paulo (22:00Z): membros 48 h, reservas 24 h, convidados 6 h.
const startsAt = '2026-11-06T22:00:00.000Z';
const membersOpenAt = '2026-11-04T22:00:00.000Z';
const reservesOpenAt = '2026-11-05T22:00:00.000Z';
const guestsOpenAt = '2026-11-06T16:00:00.000Z';

function game(overrides: Partial<Game> = {}): Game {
  return {
    groupId,
    date: '2026-11-06',
    startsAt,
    opensAt: membersOpenAt,
    reservesOpensAt: reservesOpenAt,
    guestsOpensAt: guestsOpenAt,
    myOpensAt: membersOpenAt,
    status: 'open',
    slots: 10,
    confirmed: [],
    waitlist: [],
    ...overrides,
  };
}

function guestGame(myRole: GroupRole): GuestGame {
  return {
    group: {
      id: groupId,
      name: 'Vôlei de sexta',
      sport: 'volleyball',
      weekday: 5,
      time: '19:00',
      timeZone: 'America/Sao_Paulo',
    },
    myRole,
    game: game(),
  };
}

describe('inviteUrl', () => {
  it('caso 16: membro → <origin>/join/<token>', () => {
    expect(inviteUrl(origin, 'member', 'tok-m')).toBe('https://scorely.app/join/tok-m');
  });

  it('caso 16: reserva → <origin>/join/<token>', () => {
    expect(inviteUrl(origin, 'reserve', 'tok-r')).toBe('https://scorely.app/join/tok-r');
  });

  it('caso 16: convidado → <origin>/play/<token>', () => {
    expect(inviteUrl(origin, 'guest', 'tok-g')).toBe('https://scorely.app/play/tok-g');
  });

  it('caso 16: token passa por encodeURIComponent', () => {
    expect(inviteUrl(origin, 'guest', 'a/b c')).toBe(
      `https://scorely.app/play/${encodeURIComponent('a/b c')}`,
    );
    expect(inviteUrl(origin, 'member', 'a?b#c')).toBe(
      `https://scorely.app/join/${encodeURIComponent('a?b#c')}`,
    );
  });
});

describe('playRedirect', () => {
  it('caso 16: membro vai para a página do grupo', () => {
    expect(playRedirect(guestGame('member'))).toEqual({ name: 'group', params: { id: groupId } });
  });

  it('caso 16: reserva vai para a página do grupo', () => {
    expect(playRedirect(guestGame('reserve'))).toEqual({ name: 'group', params: { id: groupId } });
  });

  it('caso 16: convidado fica no link do jogo', () => {
    expect(playRedirect(guestGame('guest'))).toBeUndefined();
  });
});

describe('listGate', () => {
  it('caso 16: antes da camada de quem vê → opens_at com myOpensAt', () => {
    const reserveView = game({ myOpensAt: reservesOpenAt });
    expect(listGate(reserveView, new Date('2026-11-05T13:00:00.000Z'))).toEqual({
      kind: 'opens_at',
      at: reservesOpenAt,
    });
  });

  it('caso 16: opens_at também com o status da camada dos membros ainda scheduled', () => {
    const memberView = game({ status: 'scheduled', myOpensAt: membersOpenAt });
    expect(listGate(memberView, new Date('2026-11-04T10:00:00.000Z'))).toEqual({
      kind: 'opens_at',
      at: membersOpenAt,
    });
  });

  it('caso 16: convidado antes da camada dele → opens_at com a abertura dos convidados', () => {
    const guestView = game({ myOpensAt: guestsOpenAt });
    expect(listGate(guestView, new Date('2026-11-06T15:59:59.000Z'))).toEqual({
      kind: 'opens_at',
      at: guestsOpenAt,
    });
  });

  it('caso 16: no instante da abertura e depois → can_change', () => {
    const reserveView = game({ myOpensAt: reservesOpenAt });
    expect(listGate(reserveView, new Date(reservesOpenAt))).toEqual({ kind: 'can_change' });
    expect(listGate(reserveView, new Date('2026-11-06T10:00:00.000Z'))).toEqual({ kind: 'can_change' });
  });

  it('caso 16: jogo começado → closed', () => {
    expect(listGate(game({ status: 'in_progress' }), new Date('2026-11-06T22:30:00.000Z'))).toEqual({
      kind: 'closed',
    });
  });

  it('caso 16: jogo cancelado → closed, mesmo com a camada aberta', () => {
    expect(listGate(game({ status: 'cancelled' }), new Date('2026-11-06T10:00:00.000Z'))).toEqual({
      kind: 'closed',
    });
  });

  it('caso 16: sem camada (sem myOpensAt) → closed', () => {
    const { myOpensAt: _omit, ...withoutLayer } = game();
    expect(listGate(withoutLayer, new Date('2026-11-06T10:00:00.000Z'))).toEqual({ kind: 'closed' });
  });
});
