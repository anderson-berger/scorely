import { memberSections, splitGroups } from '@scorely/web/src/modules/groups/groups';
import { describe, expect, it } from 'vitest';

// GRP-27 (alterada em 2026-11-15, ADR 0015): "Meus grupos" são os grupos em que a pessoa tem o cargo Dono
// (`myRoleId`, GRP-55). O grupo não diz mais quem é o dono (`ownerId`).
const a = { id: 'A', myRoleId: 'owner' as const };
const b = { id: 'B', myRoleId: 'member' as const };
const c = { id: 'C', myRoleId: 'owner' as const };
const d = { id: 'D', myRoleId: 'admin' as const };

describe('splitGroups', () => {
  it('GRP-27: separa pelo cargo Dono, na ordem de entrada', () => {
    expect(splitGroups([a, b, c])).toEqual({ owned: [a, c], joined: [b] });
  });

  it('GRP-27: o Admin (todas as permissões, sem ser dono) fica em Participo', () => {
    expect(splitGroups([d, a])).toEqual({ owned: [a], joined: [d] });
  });

  it('GRP-27: nenhum grupo meu → owned vazio e joined com todos', () => {
    expect(splitGroups([b, d])).toEqual({ owned: [], joined: [b, d] });
  });

  it('caso 4: lista vazia → as duas listas vazias', () => {
    expect(splitGroups([])).toEqual({ owned: [], joined: [] });
  });
});

// Plano 015 (D11).
describe('memberSections', () => {
  const owner = { userId: 'u-owner', roleId: 'owner' as const, tier: 'member' as const };
  const memberA = { userId: 'u-a', roleId: 'member' as const, tier: 'member' as const };
  const memberB = { userId: 'u-b', roleId: 'member' as const, tier: 'member' as const };
  const reserveR = { userId: 'u-r', roleId: 'member' as const, tier: 'reserve' as const };
  const adminReserve = { userId: 'u-x', roleId: 'admin' as const, tier: 'reserve' as const };

  it('caso 4: dono, A, reserva R, B → members [dono, A, B] e reserves [R]', () => {
    expect(memberSections([owner, memberA, reserveR, memberB])).toEqual({
      members: [owner, memberA, memberB],
      reserves: [reserveR],
    });
  });

  it('caso 5: dono no meio (A, dono, B) → members [dono, A, B]', () => {
    expect(memberSections([memberA, owner, memberB]).members).toEqual([owner, memberA, memberB]);
  });

  it('GRP-06: o dono (cargo Dono) vem primeiro; o Admin fica no seu papel (aqui, nas reservas)', () => {
    expect(memberSections([adminReserve, memberA, owner])).toEqual({
      members: [owner, memberA],
      reserves: [adminReserve],
    });
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
