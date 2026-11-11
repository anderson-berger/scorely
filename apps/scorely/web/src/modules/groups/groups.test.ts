import { describe, expect, it } from 'vitest';
import { memberSections, splitGroups } from './groups';

const me = 'u-me';
const other = 'u-other';

const a = { id: 'A', ownerId: me };
const b = { id: 'B', ownerId: other };
const c = { id: 'C', ownerId: me };

describe('splitGroups', () => {
  it('caso 1: separa por dono, na ordem de entrada', () => {
    expect(splitGroups([a, b, c], me)).toEqual({ owned: [a, c], joined: [b] });
  });

  it('caso 2: nenhum grupo meu → owned vazio e joined com todos', () => {
    const d = { id: 'D', ownerId: 'u-third' };
    expect(splitGroups([b, d], me)).toEqual({ owned: [], joined: [b, d] });
  });

  it('caso 3: sem usuário → owned vazio e joined com todos', () => {
    expect(splitGroups([a, b, c], undefined)).toEqual({ owned: [], joined: [a, b, c] });
  });

  it('caso 4: lista vazia → as duas listas vazias', () => {
    expect(splitGroups([], me)).toEqual({ owned: [], joined: [] });
  });
});

// Plano 015 (D11).
describe('memberSections', () => {
  const owner = { userId: 'u-owner', isOwner: true, role: 'member' as const };
  const memberA = { userId: 'u-a', isOwner: false, role: 'member' as const };
  const memberB = { userId: 'u-b', isOwner: false, role: 'member' as const };
  const reserveR = { userId: 'u-r', isOwner: false, role: 'reserve' as const };

  it('caso 4: dono, A, reserva R, B → members [dono, A, B] e reserves [R]', () => {
    expect(memberSections([owner, memberA, reserveR, memberB])).toEqual({
      members: [owner, memberA, memberB],
      reserves: [reserveR],
    });
  });

  it('caso 5: dono no meio (A, dono, B) → members [dono, A, B]', () => {
    expect(memberSections([memberA, owner, memberB]).members).toEqual([owner, memberA, memberB]);
  });

  it('caso 6: sem reservas → reserves vazio', () => {
    expect(memberSections([owner, memberA, memberB]).reserves).toEqual([]);
  });

  it('caso 7: não altera o array recebido', () => {
    const input = [memberA, reserveR, owner, memberB];
    const snapshot = [...input];
    memberSections(input);
    expect(input).toEqual(snapshot);
    expect(input.map((m) => m.userId)).toEqual(['u-a', 'u-r', 'u-owner', 'u-b']);
  });
});
