import { randomUUID } from 'node:crypto';
import { asGroupId, asUserId, type GroupId, type UserId } from '@scorely/api/src/lib/ids';
import {
  dynamoMatchRepository,
  type MatchRepository,
  type StoredGuest,
  type StoredMatch,
} from '@scorely/api/src/modules/matches/match.repository';
import { memoryMatches } from '@scorely/api/src/modules/matches/matches.memory';
import { beforeAll, describe, expect, inject, it } from 'vitest';

// Suíte de contrato do MatchRepository (ADR 0019): a mesma bateria roda contra a memória e contra o DynamoDB Local.
// Ids sempre novos, sem limpar entre os testes. Regras: partidas.md, seção 3 (PAR-01, 05, 06, 07, 09, 11, 12, 13, 14).

const T0 = new Date('2026-11-23T10:00:00.000Z');
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);
const newGroup = (): GroupId => asGroupId(randomUUID());
const newUser = (): UserId => asUserId(randomUUID());

function newMatch(groupId: GroupId, overrides: Partial<StoredMatch> = {}): StoredMatch {
  return {
    id: randomUUID(),
    groupId,
    createdAt: T0.toISOString(),
    updatedAt: T0.toISOString(),
    version: 1,
    startsAt: '2026-11-27T22:00:00.000Z',
    endsAt: '2026-11-28T00:00:00.000Z',
    teams: 2,
    playersPerTeam: 6,
    membersHours: 72,
    reservesHours: 24,
    guestsHours: 6,
    closeHours: 0,
    createdBy: newUser(),
    ...overrides,
  };
}

function newGuest(match: StoredMatch, name: string, overrides: Partial<StoredGuest> = {}): StoredGuest {
  return {
    id: randomUUID(),
    groupId: match.groupId,
    matchId: match.id,
    name,
    normalizedName: name.trim().toLowerCase(),
    requestedBy: newUser(),
    createdAt: T0.toISOString(),
    updatedAt: T0.toISOString(),
    version: 1,
    ...overrides,
  };
}

const read = { consistent: true };

describe.each([
  { name: 'memória', make: () => memoryMatches().repo as MatchRepository },
  { name: 'DynamoDB Local', make: () => dynamoMatchRepository as MatchRepository, dynamo: true },
])('MatchRepository ($name)', ({ make, dynamo }) => {
  const repo = make();

  beforeAll(() => {
    if (!dynamo) return;
    process.env.TABLE_NAME = inject('dynamoTableName');
    process.env.DYNAMODB_ENDPOINT = inject('dynamoEndpoint');
    process.env.AWS_REGION = 'sa-east-1';
  });

  describe('partida', () => {
    it('PAR-01: createMatch grava e getMatch devolve igual; um id que não existe volta undefined', async () => {
      const match = newMatch(newGroup());
      await repo.createMatch(match);
      expect(await repo.getMatch(match.groupId, match.id, read)).toEqual(match);
      expect(await repo.getMatch(match.groupId, randomUUID(), read)).toBeUndefined();
    });

    it('PAR-01: a partida é do grupo: o mesmo id em outro grupo não é achado', async () => {
      const match = newMatch(newGroup());
      await repo.createMatch(match);
      expect(await repo.getMatch(newGroup(), match.id, read)).toBeUndefined();
    });

    it('PAR-15: listMatches devolve só as do grupo que não terminaram antes de endsAfter', async () => {
      const groupId = newGroup();
      const upcoming = newMatch(groupId, {
        startsAt: '2026-11-27T22:00:00.000Z',
        endsAt: '2026-11-28T00:00:00.000Z',
      });
      const finished = newMatch(groupId, {
        startsAt: '2026-11-20T22:00:00.000Z',
        endsAt: '2026-11-21T00:00:00.000Z',
      });
      const other = newMatch(newGroup());
      await Promise.all([upcoming, finished, other].map((m) => repo.createMatch(m)));
      const list = await repo.listMatches(groupId, T0);
      expect(list.map((m) => m.id)).toEqual([upcoming.id]);
    });

    it('PAR-15: uma partida em andamento ainda está na lista (endsAt depois de endsAfter)', async () => {
      const groupId = newGroup();
      const running = newMatch(groupId);
      await repo.createMatch(running);
      const list = await repo.listMatches(groupId, new Date('2026-11-27T23:00:00.000Z'));
      expect(list.map((m) => m.id)).toEqual([running.id]);
    });

    it('PAR-06: updateMatch grava, sobe a version e devolve a partida nova', async () => {
      const match = newMatch(newGroup());
      await repo.createMatch(match);
      const updated = await repo.updateMatch({ ...match, note: 'Outro recado', teams: 3 }, 1, at(5));
      expect(updated).toMatchObject({
        note: 'Outro recado',
        teams: 3,
        version: 2,
        updatedAt: at(5).toISOString(),
      });
      expect(await repo.getMatch(match.groupId, match.id, read)).toEqual(updated);
    });

    it('PAR-06: updateMatch com a version velha responde VERSION_CONFLICT e não grava', async () => {
      const match = newMatch(newGroup());
      await repo.createMatch(match);
      await repo.updateMatch({ ...match, note: 'A' }, 1, at(1));
      await expect(repo.updateMatch({ ...match, note: 'B' }, 1, at(2))).rejects.toMatchObject({
        code: 'VERSION_CONFLICT',
      });
      expect((await repo.getMatch(match.groupId, match.id, read))?.note).toBe('A');
    });

    it('PAR-05: advanceMatch grava a onda aberta; repetir ou pedir uma menor devolve false e não volta', async () => {
      const match = newMatch(newGroup());
      await repo.createMatch(match);
      expect(await repo.advanceMatch(match.groupId, match.id, 'reserves', at(1))).toBe(true);
      expect((await repo.getMatch(match.groupId, match.id, read))?.advancedTo).toBe('reserves');
      expect(await repo.advanceMatch(match.groupId, match.id, 'reserves', at(2))).toBe(false);
      expect(await repo.advanceMatch(match.groupId, match.id, 'guests', at(3))).toBe(true);
      expect(await repo.advanceMatch(match.groupId, match.id, 'reserves', at(4))).toBe(false);
      expect((await repo.getMatch(match.groupId, match.id, read))?.advancedTo).toBe('guests');
    });

    it('PAR-07: cancelMatch grava cancelledAt, devolve true, e a segunda vez false sem mudar a data', async () => {
      const match = newMatch(newGroup());
      await repo.createMatch(match);
      expect(await repo.cancelMatch(match.groupId, match.id, at(10))).toBe(true);
      expect(await repo.cancelMatch(match.groupId, match.id, at(20))).toBe(false);
      const stored = await repo.getMatch(match.groupId, match.id, read);
      expect(stored?.cancelledAt).toBe(at(10).toISOString());
      expect(stored?.teams).toBe(2);
    });
  });

  describe('respostas', () => {
    it('PAR-08: putAttendance grava e listAttendances devolve as da partida', async () => {
      const match = newMatch(newGroup());
      const [ana, bia] = [newUser(), newUser()];
      const att = (userId: UserId, status: 'going' | 'not_going', minutes: number) => ({
        groupId: match.groupId,
        matchId: match.id,
        userId,
        status,
        respondedAt: at(minutes).toISOString(),
        createdAt: at(minutes).toISOString(),
      });
      await repo.putAttendance(att(ana, 'going', 1));
      await repo.putAttendance(att(bia, 'not_going', 2));
      const list = await repo.listAttendances(match.groupId, match.id, read);
      expect(list).toHaveLength(2);
      expect(list.find((a) => a.userId === ana)).toMatchObject({
        status: 'going',
        respondedAt: at(1).toISOString(),
      });
      expect(list.find((a) => a.userId === bia)?.status).toBe('not_going');
    });

    it('PAR-08: responder de novo troca a resposta e a hora (quem volta vai para o fim)', async () => {
      const match = newMatch(newGroup());
      const ana = newUser();
      const base = { groupId: match.groupId, matchId: match.id, userId: ana, createdAt: at(1).toISOString() };
      await repo.putAttendance({ ...base, status: 'going', respondedAt: at(1).toISOString() });
      await repo.putAttendance({ ...base, status: 'not_going', respondedAt: at(5).toISOString() });
      const list = await repo.listAttendances(match.groupId, match.id, read);
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ status: 'not_going', respondedAt: at(5).toISOString() });
    });

    it('PAR-08: as respostas são da partida: outra partida do grupo não aparece', async () => {
      const groupId = newGroup();
      const one = newMatch(groupId);
      const two = newMatch(groupId);
      const stamp = at(1).toISOString();
      await repo.putAttendance({
        groupId,
        matchId: one.id,
        userId: newUser(),
        status: 'going',
        respondedAt: stamp,
        createdAt: stamp,
      });
      expect(await repo.listAttendances(groupId, two.id, read)).toEqual([]);
      expect(await repo.listAttendances(groupId, one.id, read)).toHaveLength(1);
    });
  });

  describe('convidados', () => {
    it('PAR-12: requestGuest grava; getGuest e listGuests devolvem o convidado', async () => {
      const match = newMatch(newGroup());
      const guest = newGuest(match, 'Primo do Edu');
      expect(await repo.requestGuest(guest, 30)).toBe('ok');
      expect(await repo.getGuest(match.groupId, match.id, guest.id, read)).toEqual(guest);
      expect((await repo.listGuests(match.groupId, match.id, read)).map((g) => g.id)).toEqual([guest.id]);
      expect(await repo.getGuest(match.groupId, match.id, randomUUID(), read)).toBeUndefined();
    });

    it('PAR-12: o mesmo nome normalizado na partida responde duplicate e não grava', async () => {
      const match = newMatch(newGroup());
      expect(await repo.requestGuest(newGuest(match, 'Joao'), 30)).toBe('ok');
      const again = newGuest(match, 'Joao');
      expect(await repo.requestGuest(again, 30)).toBe('duplicate');
      expect(await repo.getGuest(match.groupId, match.id, again.id, read)).toBeUndefined();
      expect(await repo.listGuests(match.groupId, match.id, read)).toHaveLength(1);
    });

    it('PAR-12: o nome só vale dentro da partida: em outra partida o mesmo nome passa', async () => {
      const groupId = newGroup();
      const one = newMatch(groupId);
      const two = newMatch(groupId);
      expect(await repo.requestGuest(newGuest(one, 'Joao'), 30)).toBe('ok');
      expect(await repo.requestGuest(newGuest(two, 'Joao'), 30)).toBe('ok');
    });

    it('PAR-12: acima do máximo de ativos responde limit e não grava', async () => {
      const match = newMatch(newGroup());
      expect(await repo.requestGuest(newGuest(match, 'A'), 2)).toBe('ok');
      expect(await repo.requestGuest(newGuest(match, 'B'), 2)).toBe('ok');
      const third = newGuest(match, 'C');
      expect(await repo.requestGuest(third, 2)).toBe('limit');
      expect(await repo.getGuest(match.groupId, match.id, third.id, read)).toBeUndefined();
    });

    it('PAR-12: pedidos ao mesmo tempo nunca passam do máximo', async () => {
      const match = newMatch(newGroup());
      const results = await Promise.all(
        ['A', 'B', 'C', 'D', 'E'].map((name) => repo.requestGuest(newGuest(match, name), 3)),
      );
      expect(results.filter((r) => r === 'ok')).toHaveLength(3);
      expect(results.filter((r) => r === 'limit')).toHaveLength(2);
      expect(await repo.listGuests(match.groupId, match.id, read)).toHaveLength(3);
    });

    it('PAR-12: dois pedidos ao mesmo tempo com o mesmo nome: um passa, o outro é duplicate', async () => {
      const match = newMatch(newGroup());
      const results = await Promise.all([
        repo.requestGuest(newGuest(match, 'Joao'), 30),
        repo.requestGuest(newGuest(match, 'Joao'), 30),
      ]);
      expect([...results].sort()).toEqual(['duplicate', 'ok']);
    });

    it('PAR-13: approve grava approvedAt e approvedBy; a segunda vez devolve false', async () => {
      const match = newMatch(newGroup());
      const guest = newGuest(match, 'Joao');
      const by = newUser();
      await repo.requestGuest(guest, 30);
      expect(await repo.transitionGuest({ guest, transition: 'approve', by, at: at(5) })).toBe(true);
      expect(await repo.getGuest(match.groupId, match.id, guest.id, read)).toMatchObject({
        approvedAt: at(5).toISOString(),
        approvedBy: by,
      });
      expect(await repo.transitionGuest({ guest, transition: 'approve', by, at: at(6) })).toBe(false);
      expect((await repo.getGuest(match.groupId, match.id, guest.id, read))?.approvedAt).toBe(
        at(5).toISOString(),
      );
    });

    it('PAR-13: decline grava declinedAt e declinedBy, libera o nome e a vaga do limite', async () => {
      const match = newMatch(newGroup());
      const guest = newGuest(match, 'Joao');
      const by = newUser();
      await repo.requestGuest(guest, 1);
      expect(await repo.requestGuest(newGuest(match, 'Maria'), 1)).toBe('limit');
      expect(await repo.transitionGuest({ guest, transition: 'decline', by, at: at(5) })).toBe(true);
      expect(await repo.getGuest(match.groupId, match.id, guest.id, read)).toMatchObject({
        declinedAt: at(5).toISOString(),
        declinedBy: by,
      });
      expect(await repo.requestGuest(newGuest(match, 'Joao'), 1)).toBe('ok');
    });

    it('PAR-11, PAR-14: cancel (pending) grava cancelledAt e libera o nome', async () => {
      const match = newMatch(newGroup());
      const guest = newGuest(match, 'Joao');
      await repo.requestGuest(guest, 30);
      expect(
        await repo.transitionGuest({ guest, transition: 'cancel', by: guest.requestedBy, at: at(5) }),
      ).toBe(true);
      expect((await repo.getGuest(match.groupId, match.id, guest.id, read))?.cancelledAt).toBe(
        at(5).toISOString(),
      );
      expect(await repo.requestGuest(newGuest(match, 'Joao'), 30)).toBe('ok');
    });

    it('PAR-11, PAR-14: remove só vale para um approved; grava removedAt e removedBy e libera o nome', async () => {
      const match = newMatch(newGroup());
      const guest = newGuest(match, 'Joao');
      const by = newUser();
      await repo.requestGuest(guest, 30);
      expect(await repo.transitionGuest({ guest, transition: 'remove', by, at: at(4) })).toBe(false);
      await repo.transitionGuest({ guest, transition: 'approve', by, at: at(5) });
      expect(await repo.transitionGuest({ guest, transition: 'remove', by, at: at(6) })).toBe(true);
      expect(await repo.getGuest(match.groupId, match.id, guest.id, read)).toMatchObject({
        removedAt: at(6).toISOString(),
        removedBy: by,
      });
      expect(await repo.requestGuest(newGuest(match, 'Joao'), 30)).toBe('ok');
    });

    it('PAR-11: só se passa de pending (approve, decline, cancel); de declined não se aprova', async () => {
      const match = newMatch(newGroup());
      const guest = newGuest(match, 'Joao');
      const by = newUser();
      await repo.requestGuest(guest, 30);
      await repo.transitionGuest({ guest, transition: 'decline', by, at: at(5) });
      expect(await repo.transitionGuest({ guest, transition: 'approve', by, at: at(6) })).toBe(false);
      expect(await repo.transitionGuest({ guest, transition: 'cancel', by, at: at(7) })).toBe(false);
    });

    it('PAR-11: o convidado fora da lista continua guardado (nada é apagado)', async () => {
      const match = newMatch(newGroup());
      const guest = newGuest(match, 'Joao');
      await repo.requestGuest(guest, 30);
      await repo.transitionGuest({ guest, transition: 'decline', by: newUser(), at: at(5) });
      expect((await repo.listGuests(match.groupId, match.id, read)).map((g) => g.id)).toEqual([guest.id]);
    });

    it('PAR-12: aprovar e recusar ao mesmo tempo: só uma das duas vale', async () => {
      const match = newMatch(newGroup());
      const guest = newGuest(match, 'Joao');
      await repo.requestGuest(guest, 30);
      const results = await Promise.all([
        repo.transitionGuest({ guest, transition: 'approve', by: newUser(), at: at(5) }),
        repo.transitionGuest({ guest, transition: 'decline', by: newUser(), at: at(5) }),
      ]);
      expect(results.filter(Boolean)).toHaveLength(1);
    });
  });
});
