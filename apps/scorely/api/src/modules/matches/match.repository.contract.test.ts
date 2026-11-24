import { randomUUID } from 'node:crypto';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { dynamo as dynamoClient, tableName } from '@scorely/api/src/lib/dynamo';
import { asGroupId, asPublicGroupId, asUserId, type GroupId, type UserId } from '@scorely/api/src/lib/ids';
import {
  dynamoMatchRepository,
  type MatchRepository,
  type StoredGuest,
  type StoredMatch,
  type StoredSeries,
  type StoredTeamPlayer,
} from '@scorely/api/src/modules/matches/match.repository';
import { matchAgendaKey } from '@scorely/api/src/modules/matches/match.table';
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
    noGuests: false,
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

function newSeries(match: StoredMatch, overrides: Partial<StoredSeries> = {}): StoredSeries {
  return {
    id: randomUUID(),
    groupId: match.groupId,
    createdAt: T0.toISOString(),
    updatedAt: T0.toISOString(),
    version: 1,
    weekday: 5,
    time: '19:00',
    durationMinutes: 120,
    timeZone: 'America/Sao_Paulo',
    noGuests: false,
    closeHours: 0,
    currentMatchId: match.id,
    currentDate: '2026-11-27',
    createdBy: match.createdBy,
    ...overrides,
  };
}

const agendaOf = (match: StoredMatch, when: string) => ({
  at: when,
  groupId: match.groupId,
  matchId: match.id,
  publicId: asPublicGroupId('K3X9PQ2A'),
  groupName: 'Pelada de sexta',
});

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
      const updated = await repo.updateMatch({ ...match, closeHours: 2, teams: 3 }, 1, at(5));
      expect(updated).toMatchObject({
        closeHours: 2,
        teams: 3,
        version: 2,
        updatedAt: at(5).toISOString(),
      });
      expect(await repo.getMatch(match.groupId, match.id, read)).toEqual(updated);
    });

    it('PAR-06: updateMatch com a version velha responde VERSION_CONFLICT e não grava', async () => {
      const match = newMatch(newGroup());
      await repo.createMatch(match);
      await repo.updateMatch({ ...match, closeHours: 1 }, 1, at(1));
      await expect(repo.updateMatch({ ...match, closeHours: 2 }, 1, at(2))).rejects.toMatchObject({
        code: 'VERSION_CONFLICT',
      });
      expect((await repo.getMatch(match.groupId, match.id, read))?.closeHours).toBe(1);
    });

    it('PAR-01, PAR-02, PAR-03: a partida limpa (sem formato e sem horas) é gravada e lida sem inventar campos', async () => {
      const {
        teams: _t,
        playersPerTeam: _p,
        membersHours: _m,
        reservesHours: _r,
        guestsHours: _g,
        ...rest
      } = newMatch(newGroup());
      const clean: StoredMatch = { ...rest, noGuests: false, closeHours: 0 };
      await repo.createMatch(clean);
      const stored = await repo.getMatch(clean.groupId, clean.id, read);
      expect(stored).toMatchObject({ id: clean.id, noGuests: false, closeHours: 0 });
      expect(stored?.teams).toBeUndefined();
      expect(stored?.playersPerTeam).toBeUndefined();
      expect(stored?.membersHours).toBeUndefined();
      expect(stored?.reservesHours).toBeUndefined();
      expect(stored?.guestsHours).toBeUndefined();
      expect(stored).not.toHaveProperty('note');
    });

    it('PAR-06: updateMatch tira o formato e as horas (voltam a ausentes) e grava "sem convidados"', async () => {
      const match = newMatch(newGroup());
      await repo.createMatch(match);
      const {
        teams: _t,
        playersPerTeam: _p,
        membersHours: _m,
        reservesHours: _r,
        guestsHours: _g,
        ...rest
      } = match;
      const updated = await repo.updateMatch({ ...rest, noGuests: true }, 1, at(5));
      expect(updated.teams).toBeUndefined();
      expect(updated.membersHours).toBeUndefined();
      expect(updated.guestsHours).toBeUndefined();
      expect(updated.noGuests).toBe(true);
      expect(await repo.getMatch(match.groupId, match.id, read)).toEqual(updated);
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
  describe('times', () => {
    const user = (): StoredTeamPlayer => ({ kind: 'user', id: randomUUID() });
    const guest = (): StoredTeamPlayer => ({ kind: 'guest', id: randomUUID() });

    it('PAR-25: getTeams de partida sem times devolve undefined', async () => {
      const match = newMatch(newGroup());
      expect(await repo.getTeams(match.groupId, match.id, read)).toBeUndefined();
    });

    it('PAR-25, 29: salvar com expectedVersion 0 cria (version 1, quem e quando) e diz que criou', async () => {
      const match = newMatch(newGroup());
      const by = newUser();
      const teams = [[user(), guest()], [user()]];
      const result = await repo.saveTeams({
        groupId: match.groupId,
        matchId: match.id,
        teams,
        by,
        at: at(1),
        expectedVersion: 0,
      });
      expect(result.created).toBe(true);
      expect(result.teams).toMatchObject({
        groupId: match.groupId,
        matchId: match.id,
        teams,
        version: 1,
        createdBy: by,
        updatedBy: by,
        createdAt: at(1).toISOString(),
        updatedAt: at(1).toISOString(),
      });
      expect(await repo.getTeams(match.groupId, match.id, read)).toEqual(result.teams);
    });

    it('PAR-25: criar com 0 de novo responde VERSION_CONFLICT com a version atual e não troca', async () => {
      const match = newMatch(newGroup());
      const first = [[user()], [user()]];
      const base = {
        groupId: match.groupId,
        matchId: match.id,
        by: newUser(),
        at: at(1),
        expectedVersion: 0,
      };
      await repo.saveTeams({ ...base, teams: first });
      const err = await repo.saveTeams({ ...base, teams: [[user()], []] }).catch((e: unknown) => e);
      expect(err).toMatchObject({ code: 'VERSION_CONFLICT', details: { currentVersion: 1 } });
      expect((await repo.getTeams(match.groupId, match.id, read))?.teams).toEqual(first);
    });

    it('PAR-25: salvar com a version certa troca a lista inteira, mantém quem criou e não conta como criação', async () => {
      const match = newMatch(newGroup());
      const creator = newUser();
      const editor = newUser();
      await repo.saveTeams({
        groupId: match.groupId,
        matchId: match.id,
        teams: [[user()], [user()]],
        by: creator,
        at: at(1),
        expectedVersion: 0,
      });
      const next = [[user(), user(), user()], [], [guest()]];
      const result = await repo.saveTeams({
        groupId: match.groupId,
        matchId: match.id,
        teams: next,
        by: editor,
        at: at(5),
        expectedVersion: 1,
      });
      expect(result.created).toBe(false);
      expect(result.teams).toMatchObject({
        teams: next,
        version: 2,
        createdBy: creator,
        createdAt: at(1).toISOString(),
        updatedBy: editor,
        updatedAt: at(5).toISOString(),
      });
      expect((await repo.getTeams(match.groupId, match.id, read))?.teams).toEqual(next);
    });

    it('PAR-25: version velha responde VERSION_CONFLICT e não grava', async () => {
      const match = newMatch(newGroup());
      const base = { groupId: match.groupId, matchId: match.id, by: newUser(), at: at(1) };
      await repo.saveTeams({ ...base, teams: [[user()], []], expectedVersion: 0 });
      await repo.saveTeams({ ...base, teams: [[], [user()]], expectedVersion: 1 });
      const err = await repo
        .saveTeams({ ...base, teams: [[user()], [user()]], expectedVersion: 1 })
        .catch((e: unknown) => e);
      expect(err).toMatchObject({ code: 'VERSION_CONFLICT', details: { currentVersion: 2 } });
      expect((await repo.getTeams(match.groupId, match.id, read))?.version).toBe(2);
    });

    it('PAR-25: version esperada 3 onde não há times responde VERSION_CONFLICT com 0', async () => {
      const match = newMatch(newGroup());
      const err = await repo
        .saveTeams({
          groupId: match.groupId,
          matchId: match.id,
          teams: [[user()], []],
          by: newUser(),
          at: at(1),
          expectedVersion: 3,
        })
        .catch((e: unknown) => e);
      expect(err).toMatchObject({ code: 'VERSION_CONFLICT', details: { currentVersion: 0 } });
      expect(await repo.getTeams(match.groupId, match.id, read)).toBeUndefined();
    });

    it('PAR-29: dois primeiros salvares ao mesmo tempo: um cria, o outro é VERSION_CONFLICT', async () => {
      const match = newMatch(newGroup());
      const base = {
        groupId: match.groupId,
        matchId: match.id,
        by: newUser(),
        at: at(1),
        expectedVersion: 0,
      };
      const results = await Promise.allSettled([
        repo.saveTeams({ ...base, teams: [[user()], []] }),
        repo.saveTeams({ ...base, teams: [[], [user()]] }),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    });
  });

  describe('repetição e agenda', () => {
    it('PAR-20: createMatch com a repetição grava as duas; listSeries devolve as do grupo', async () => {
      const match = newMatch(newGroup());
      const series = newSeries(match);
      const linked = { ...match, seriesId: series.id, seriesDate: series.currentDate };
      await repo.createMatch(linked, { series });
      expect(await repo.getMatch(match.groupId, match.id, read)).toEqual(linked);
      expect(await repo.getSeries(match.groupId, series.id, read)).toEqual(series);
      expect(await repo.listSeries(match.groupId)).toEqual([series]);
      expect(await repo.getSeries(newGroup(), series.id, read)).toBeUndefined();
    });

    it('PAR-22: updateSeries confere a version, apaga os opcionais ausentes e não mexe no endedAt', async () => {
      const match = newMatch(newGroup());
      const series = newSeries(match, { teams: 2, playersPerTeam: 6 });
      await repo.createMatch(match, { series });
      const saved = await repo.updateSeries(
        { ...series, time: '20:00', teams: undefined, playersPerTeam: undefined },
        1,
        at(1),
      );
      expect(saved).toMatchObject({ time: '20:00', version: 2, updatedAt: at(1).toISOString() });
      expect(saved.teams).toBeUndefined();
      await expect(repo.updateSeries(series, 1, at(2))).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    });

    it('PAR-23: endSeries grava uma vez; a segunda volta false', async () => {
      const match = newMatch(newGroup());
      const series = newSeries(match);
      await repo.createMatch(match, { series });
      expect(await repo.endSeries(match.groupId, series.id, at(1))).toBe(true);
      expect(await repo.endSeries(match.groupId, series.id, at(2))).toBe(false);
      expect((await repo.getSeries(match.groupId, series.id, read))?.endedAt).toBe(at(1).toISOString());
    });

    it('PAR-21: createNextMatch cria uma vez só, e não cria com a repetição encerrada', async () => {
      const match = newMatch(newGroup());
      const series = newSeries(match);
      await repo.createMatch(match, { series });
      const next = { ...newMatch(match.groupId), seriesId: series.id, seriesDate: '2026-12-04' };
      const other = { ...newMatch(match.groupId), seriesId: series.id, seriesDate: '2026-12-04' };
      const results = await Promise.all([
        repo.createNextMatch({ match: next, previousMatchId: match.id, agenda: [], at: at(1) }),
        repo.createNextMatch({ match: other, previousMatchId: match.id, agenda: [], at: at(1) }),
      ]);
      expect(results.filter(Boolean)).toHaveLength(1);
      expect((await repo.getSeries(match.groupId, series.id, read))?.currentDate).toBe('2026-12-04');

      const ended = newMatch(newGroup());
      const endedSeries = newSeries(ended);
      await repo.createMatch(ended, { series: endedSeries });
      await repo.endSeries(ended.groupId, endedSeries.id, at(1));
      const after = { ...newMatch(ended.groupId), seriesId: endedSeries.id, seriesDate: '2026-12-04' };
      expect(
        await repo.createNextMatch({ match: after, previousMatchId: ended.id, agenda: [], at: at(2) }),
      ).toBe(false);
      expect(await repo.getMatch(ended.groupId, after.id, read)).toBeUndefined();
    });

    it('PAR-24: markNotified grava só se a onda avisada ainda é a lida, sem somar a version', async () => {
      const match = newMatch(newGroup());
      await repo.createMatch(match);
      expect(await repo.markNotified(match.groupId, match.id, undefined, 'members')).toBe(true);
      expect(await repo.markNotified(match.groupId, match.id, undefined, 'members')).toBe(false);
      expect(await repo.markNotified(match.groupId, match.id, 'members', 'reserves')).toBe(true);
      const saved = await repo.getMatch(match.groupId, match.id, read);
      expect(saved).toMatchObject({ notifiedWave: 'reserves', version: 1 });
    });

    it('PAR-24: updateMatch mantém o notifiedWave do banco, a não ser com resetNotified', async () => {
      const match = newMatch(newGroup());
      await repo.createMatch(match);
      await repo.markNotified(match.groupId, match.id, undefined, 'members');
      const kept = await repo.updateMatch({ ...match, notifiedWave: undefined }, 1, at(1));
      expect(kept.notifiedWave).toBe('members');
      const reset = await repo.updateMatch({ ...match, notifiedWave: undefined }, 2, at(2), {
        resetNotified: true,
      });
      expect(reset.notifiedWave).toBeUndefined();
    });

    it('PAR-21, 24: a agenda devolve os itens com instante até agora, das horas pedidas, e o apagado some', async () => {
      const match = newMatch(newGroup());
      await repo.createMatch(match);
      const base = '2031-01-01T10';
      const early = agendaOf(match, `${base}:05:00.000Z`);
      const due = agendaOf(match, `${base}:20:00.000Z`);
      const later = agendaOf(match, `${base}:50:00.000Z`);
      await repo.putAgenda([early, due, later], new Date('2031-01-01T09:00:00.000Z'));
      const mine = (list: { matchId: string }[]) => list.filter((e) => e.matchId === match.id);
      const now = new Date(`${base}:30:00.000Z`);
      expect(mine(await repo.listAgenda(new Date(`${base}:10:00.000Z`), now))).toEqual([early, due]);
      await repo.deleteAgenda(early);
      expect(mine(await repo.listAgenda(new Date('2031-01-01T08:00:00.000Z'), now))).toEqual([due]);
      expect(
        mine(
          await repo.listAgenda(new Date('2031-01-01T11:00:00.000Z'), new Date('2031-01-01T12:00:00.000Z')),
        ),
      ).toEqual([]);
    });

    it.runIf(dynamo)(
      'PAR-21, 24: regravar o item da agenda mantém o createdAt da primeira gravação',
      async () => {
        const match = newMatch(newGroup());
        await repo.createMatch(match);
        const entry = agendaOf(match, '2031-02-01T10:20:00.000Z');
        await repo.putAgenda([entry], at(1));
        await repo.putAgenda([entry], at(30));
        const { Item } = await dynamoClient().send(
          new GetCommand({
            TableName: tableName(),
            Key: matchAgendaKey(entry.at, match.groupId, match.id),
            ConsistentRead: true,
          }),
        );
        expect(Item?.createdAt).toBe(at(1).toISOString());
      },
    );

    it('PAR-21, 24: o cursor da rotina guarda a última leitura', async () => {
      await repo.setAgendaCursor(at(5));
      expect(await repo.getAgendaCursor()).toBe(at(5).toISOString());
    });
  });
});
