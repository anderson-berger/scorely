import type { UserId } from '@scorely/api/src/lib/ids';
import {
  ANA,
  BIA,
  CAIO,
  END,
  failure,
  iso,
  MEMBERS_AT,
  matchesSetup,
  NEXT_START,
  PUB,
  PUBLIC_ID,
  RESERVES_AT,
  START,
  T0,
  ZONE,
} from '@scorely/api/src/modules/groups/matches/tests/fixtures';
import type { MatchTeamPlayerRef, UpdateMatchInput } from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

// Partida iniciada e finalizada à mão (PAR-41–43) e o que muda em outras regras por isso.
// Repositório em memória, grupo falso e relógio fake.
// Nomes que o doc não fixa e que estes testes assumem: service.start, service.unstart e service.finish,
// todos (userId, publicId, matchId) => Match, como o cancel.

const UNKNOWN_MATCH = '00000000-0000-4000-8000-000000000001';

function setup() {
  const { service, at, sent } = matchesSetup([
    [ANA, 'member'],
    [BIA, 'member'],
    [CAIO, 'member'],
  ]);
  return { service, at, sent };
}
type T = ReturnType<typeof setup>;

const get = (t: T, user: UserId, matchId: string) => t.service.get(user, PUBLIC_ID, matchId);
const start = (t: T, matchId: string, user: UserId = ANA) => t.service.start(user, PUBLIC_ID, matchId);
const unstart = (t: T, matchId: string, user: UserId = ANA) => t.service.unstart(user, PUBLIC_ID, matchId);
const finish = (t: T, matchId: string, user: UserId = ANA) => t.service.finish(user, PUBLIC_ID, matchId);
const create = (t: T, startsAt = START, endsAt = END) =>
  t.service.create(ANA, PUBLIC_ID, { startsAt, endsAt });
const createSeries = (t: T) =>
  t.service.create(ANA, PUBLIC_ID, {
    startsAt: START,
    endsAt: END,
    repeatWeekly: true,
    timeZone: ZONE,
  });
const go = (t: T, user: UserId, matchId: string, status: 'going' | 'not_going' = 'going') =>
  t.service.setAttendance(user, PUBLIC_ID, matchId, { status });
const ref = (id: UserId): MatchTeamPlayerRef => ({
  kind: 'user',
  id: PUB[id] as never,
});
const settings = (over: Partial<Omit<UpdateMatchInput, 'expectedVersion'>> = {}) => ({
  startsAt: START,
  endsAt: END,
  membersHours: 72,
  reservesHours: 24,
  guestsHours: 6,
  noGuests: false,
  closeHours: 0,
  resultMode: 'day' as const,
  ...over,
});
const dayResult = (expectedVersion = 0) => ({
  mode: 'day' as const,
  teams: [[ref(ANA)], [ref(BIA)]],
  winner: 1,
  expectedVersion,
});

/** Partida criada e com ANA e BIA dentro, ainda não iniciada (relógio em T0). */
async function withPlayers(t: T) {
  const m = await create(t);
  await go(t, ANA, m.id);
  await go(t, BIA, m.id);
  return m;
}

describe('PAR-41: iniciar a partida', () => {
  it('PAR-41: inicia a qualquer hora, inclusive dias antes da hora marcada: vira in_progress com startedAt', async () => {
    const t = setup();
    const m = await create(t);
    const started = await start(t, m.id);
    expect(started.status).toBe('in_progress');
    expect(started.startedAt).toBe(T0);
    expect(started.finishedAt).toBeUndefined();
    expect(started.version).toBeGreaterThan(m.version);
    expect(started.actions).toMatchObject({
      start: false,
      unstart: true,
      finish: true,
    });
    expect((await get(t, BIA, m.id)).status).toBe('in_progress');
  });

  it('PAR-41: sem matches.manage, GROUP_PERMISSION_DENIED; partida desconhecida, MATCH_NOT_FOUND; as ações só para quem pode', async () => {
    const t = setup();
    const m = await create(t);
    expect((await failure(start(t, m.id, BIA)))?.code).toBe('GROUP_PERMISSION_DENIED');
    expect((await failure(start(t, UNKNOWN_MATCH)))?.code).toBe('MATCH_NOT_FOUND');
    expect((await get(t, BIA, m.id)).status).not.toBe('in_progress');
    expect((await get(t, BIA, m.id)).actions).toMatchObject({
      start: false,
      unstart: false,
      finish: false,
    });
    expect((await get(t, ANA, m.id)).actions).toMatchObject({
      start: true,
      unstart: false,
      finish: false,
    });
  });

  it('PAR-41: iniciar congela a lista: responder, editar, cancelar e liberar ou recusar convidado dão MATCH_STARTED', async () => {
    const t = setup();
    const m = await withPlayers(t);
    await t.service.requestGuest(BIA, PUBLIC_ID, m.id, { name: 'Primo' });
    const fresh = await get(t, ANA, m.id);
    const guestId = fresh.guestRequests[0]?.id as string;
    await start(t, m.id);
    expect((await failure(go(t, CAIO, m.id)))?.code).toBe('MATCH_STARTED');
    expect((await failure(go(t, BIA, m.id, 'not_going')))?.code).toBe('MATCH_STARTED');
    const edit = t.service.update(ANA, PUBLIC_ID, m.id, {
      ...settings(),
      expectedVersion: fresh.version,
    });
    expect((await failure(edit))?.code).toBe('MATCH_STARTED');
    expect((await failure(t.service.cancel(ANA, PUBLIC_ID, m.id)))?.code).toBe('MATCH_STARTED');
    const approve = t.service.approveGuest(ANA, PUBLIC_ID, m.id, guestId);
    expect((await failure(approve))?.code).toBe('MATCH_STARTED');
    const decline = t.service.declineGuest(ANA, PUBLIC_ID, m.id, guestId);
    expect((await failure(decline))?.code).toBe('MATCH_STARTED');
  });

  it('PAR-41: iniciada, os times continuam mudando e o resultado já pode ser registrado, antes da hora marcada', async () => {
    const t = setup();
    const m = await withPlayers(t);
    await start(t, m.id);
    const teams = await t.service.saveTeams(ANA, PUBLIC_ID, m.id, {
      teams: [[ref(ANA)], [ref(BIA)]],
      expectedVersion: 0,
    });
    expect(teams.lineup?.list).toHaveLength(2);
    const saved = await t.service.saveResult(ANA, PUBLIC_ID, m.id, dayResult());
    expect(saved.result).toMatchObject({ mode: 'day', winner: 1 });
  });

  it('PAR-41: iniciar de novo não muda nada (mesma version e mesmo startedAt)', async () => {
    const t = setup();
    const m = await create(t);
    const first = await start(t, m.id);
    t.at(iso(T0, 1));
    const second = await start(t, m.id);
    expect(second.startedAt).toBe(first.startedAt);
    expect(second.version).toBe(first.version);
  });

  it('PAR-41: na cancelada, MATCH_CANCELLED; na finalizada, MATCH_FINISHED', async () => {
    const t = setup();
    const a = await create(t);
    await t.service.cancel(ANA, PUBLIC_ID, a.id);
    expect((await failure(start(t, a.id)))?.code).toBe('MATCH_CANCELLED');
    const b = await create(t, iso(START, 24), iso(END, 24));
    await start(t, b.id);
    await finish(t, b.id);
    expect((await failure(start(t, b.id)))?.code).toBe('MATCH_FINISHED');
  });

  it('PAR-41: ninguém é avisado ao iniciar', async () => {
    const t = setup();
    const m = await withPlayers(t);
    const before = t.sent.length;
    await start(t, m.id);
    expect(t.sent).toHaveLength(before);
  });

  it('PAR-41, 16: a hora marcada não inicia nada: passada a hora sem iniciar, closed, e ainda edita e cancela', async () => {
    const t = setup();
    const m = await create(t);
    t.at(iso(END, 5));
    const late = await get(t, BIA, m.id);
    expect(late.status).toBe('closed');
    expect(late.startedAt).toBeUndefined();
    const edited = await t.service.update(ANA, PUBLIC_ID, m.id, {
      ...settings({ startsAt: iso(START, 24 * 7), endsAt: iso(END, 24 * 7) }),
      expectedVersion: late.version,
    });
    expect(edited.status).not.toBe('in_progress');
    expect((await t.service.cancel(ANA, PUBLIC_ID, m.id)).status).toBe('cancelled');
  });

  it('PAR-41, 16: iniciada, a partida espera para sempre: passado o fim marcado segue in_progress e nas próximas', async () => {
    const t = setup();
    const m = await create(t);
    await start(t, m.id);
    t.at(iso(END, 24 * 30));
    expect((await get(t, BIA, m.id)).status).toBe('in_progress');
    expect((await t.service.list(BIA, PUBLIC_ID)).map((i) => i.id)).toContain(m.id);
    expect((await t.service.history(BIA, PUBLIC_ID)).items).toHaveLength(0);
  });

  it('PAR-24: iniciada, a onda que abre pela hora não avisa (rotina)', async () => {
    const t = setup();
    const first = await create(t);
    const m = await t.service.update(ANA, PUBLIC_ID, first.id, {
      ...settings(),
      expectedVersion: first.version,
    });
    await start(t, m.id);
    t.at(MEMBERS_AT);
    await t.service.runAgenda();
    t.at(RESERVES_AT);
    await t.service.runAgenda();
    expect(t.sent.filter((n) => n.type === 'match_list_open')).toHaveLength(0);
  });
});

describe('PAR-42: voltar a partida iniciada para a lista', () => {
  it('PAR-42: volta como antes de iniciar: sem startedAt, a situação sai da hora, e a lista, as configurações e o cancelar voltam', async () => {
    const t = setup();
    const m = await create(t);
    await start(t, m.id);
    const back = await unstart(t, m.id);
    expect(back.startedAt).toBeUndefined();
    expect(back.status).toBe('open');
    expect(back.actions).toMatchObject({
      start: true,
      unstart: false,
      finish: false,
    });
    await go(t, BIA, m.id);
    const now = await get(t, ANA, m.id);
    expect(now.in).toHaveLength(1);
    const edited = await t.service.update(ANA, PUBLIC_ID, m.id, {
      ...settings(),
      expectedVersion: now.version,
    });
    expect(edited.startedAt).toBeUndefined();
    expect((await t.service.cancel(ANA, PUBLIC_ID, m.id)).status).toBe('cancelled');
  });

  it('PAR-42: depois da hora marcada, a situação volta a ser closed', async () => {
    const t = setup();
    const m = await create(t);
    await start(t, m.id);
    t.at(iso(END, 1));
    expect((await unstart(t, m.id)).status).toBe('closed');
  });

  it('PAR-42: com resultado registrado, MATCH_HAS_RESULT e a partida segue iniciada', async () => {
    const t = setup();
    const m = await withPlayers(t);
    await start(t, m.id);
    await t.service.saveResult(ANA, PUBLIC_ID, m.id, dayResult());
    expect((await failure(unstart(t, m.id)))?.code).toBe('MATCH_HAS_RESULT');
    expect((await get(t, ANA, m.id)).status).toBe('in_progress');
  });

  it('PAR-42: a partida não iniciada não muda; na finalizada, MATCH_FINISHED; sem permissão, GROUP_PERMISSION_DENIED', async () => {
    const t = setup();
    const m = await create(t);
    const same = await unstart(t, m.id);
    expect(same.version).toBe(m.version);
    expect(same.startedAt).toBeUndefined();
    await start(t, m.id);
    expect((await failure(unstart(t, m.id, BIA)))?.code).toBe('GROUP_PERMISSION_DENIED');
    await finish(t, m.id);
    expect((await failure(unstart(t, m.id)))?.code).toBe('MATCH_FINISHED');
  });

  it('PAR-42: depois de voltar, dá para iniciar de novo, e ninguém é avisado', async () => {
    const t = setup();
    const m = await withPlayers(t);
    const before = t.sent.length;
    await start(t, m.id);
    await unstart(t, m.id);
    expect((await start(t, m.id)).status).toBe('in_progress');
    expect(t.sent).toHaveLength(before);
  });
});

describe('PAR-43: finalizar a partida', () => {
  it('PAR-43: antes de iniciar, MATCH_NOT_STARTED; sem permissão, GROUP_PERMISSION_DENIED', async () => {
    const t = setup();
    const m = await create(t);
    expect((await failure(finish(t, m.id)))?.code).toBe('MATCH_NOT_STARTED');
    await start(t, m.id);
    expect((await failure(finish(t, m.id, BIA)))?.code).toBe('GROUP_PERMISSION_DENIED');
  });

  it('PAR-43: finaliza a qualquer hora, sem resultado: vira finished com finishedAt, sai das próximas e vai para o histórico', async () => {
    const t = setup();
    const m = await create(t);
    await start(t, m.id);
    t.at(iso(T0, 1));
    const done = await finish(t, m.id);
    expect(done.status).toBe('finished');
    expect(done.finishedAt).toBe(iso(T0, 1));
    expect(done.startedAt).toBe(T0);
    expect(done.actions).toMatchObject({
      start: false,
      unstart: false,
      finish: false,
    });
    expect(await t.service.list(BIA, PUBLIC_ID)).toHaveLength(0);
    const page = await t.service.history(BIA, PUBLIC_ID);
    expect(page.items.map((i) => i.id)).toEqual([m.id]);
    expect(page.items[0]?.status).toBe('finished');
  });

  it('PAR-43: finalizar de novo não muda nada; na cancelada, MATCH_CANCELLED', async () => {
    const t = setup();
    const m = await create(t);
    await start(t, m.id);
    const first = await finish(t, m.id);
    t.at(iso(T0, 2));
    const second = await finish(t, m.id);
    expect(second.finishedAt).toBe(first.finishedAt);
    expect(second.version).toBe(first.version);
    const c = await create(t, iso(START, 24), iso(END, 24));
    await t.service.cancel(ANA, PUBLIC_ID, c.id);
    expect((await failure(finish(t, c.id)))?.code).toBe('MATCH_CANCELLED');
  });

  it('PAR-43: finalizar não se desfaz: voltar para a lista dá MATCH_FINISHED', async () => {
    const t = setup();
    const m = await create(t);
    await start(t, m.id);
    await finish(t, m.id);
    expect((await failure(unstart(t, m.id)))?.code).toBe('MATCH_FINISHED');
    expect((await get(t, BIA, m.id)).status).toBe('finished');
  });

  it('PAR-43, 25: finalizada, os times travam (MATCH_FINISHED); durante o jogo, mesmo passada a hora, ainda mudam', async () => {
    const t = setup();
    const m = await withPlayers(t);
    await start(t, m.id);
    t.at(iso(END, 10));
    const body = { teams: [[ref(ANA)], [ref(BIA)]], expectedVersion: 0 };
    const saved = await t.service.saveTeams(ANA, PUBLIC_ID, m.id, body);
    await finish(t, m.id);
    const again = t.service.saveTeams(ANA, PUBLIC_ID, m.id, {
      ...body,
      expectedVersion: saved.lineup?.version ?? 1,
    });
    expect((await failure(again))?.code).toBe('MATCH_FINISHED');
  });

  it('PAR-43, 32: finalizada, o resultado ainda se registra e se corrige', async () => {
    const t = setup();
    const m = await withPlayers(t);
    await start(t, m.id);
    await finish(t, m.id);
    const first = await t.service.saveResult(ANA, PUBLIC_ID, m.id, dayResult());
    const fixed = await t.service.saveResult(ANA, PUBLIC_ID, m.id, {
      ...dayResult(first.result?.version ?? 1),
      winner: 2,
    });
    expect(fixed.result).toMatchObject({ winner: 2 });
    expect((await t.service.history(BIA, PUBLIC_ID)).items[0]?.result).toMatchObject({ winner: 2 });
  });

  it('PAR-43: ninguém é avisado ao finalizar', async () => {
    const t = setup();
    const m = await withPlayers(t);
    await start(t, m.id);
    const before = t.sent.length;
    await finish(t, m.id);
    expect(t.sent).toHaveLength(before);
  });
});

describe('PAR-32: o resultado pede a partida iniciada, não a hora', () => {
  it('PAR-32: antes de iniciar, MATCH_NOT_STARTED, mesmo passada a hora marcada', async () => {
    const t = setup();
    const m = await withPlayers(t);
    const first = t.service.saveResult(ANA, PUBLIC_ID, m.id, dayResult());
    expect((await failure(first))?.code).toBe('MATCH_NOT_STARTED');
    t.at(iso(END, 2));
    const late = t.service.saveResult(ANA, PUBLIC_ID, m.id, dayResult());
    expect((await failure(late))?.code).toBe('MATCH_NOT_STARTED');
  });

  it('PAR-32: na cancelada, MATCH_CANCELLED', async () => {
    const t = setup();
    const m = await withPlayers(t);
    await t.service.cancel(ANA, PUBLIC_ID, m.id);
    const saved = t.service.saveResult(ANA, PUBLIC_ID, m.id, dayResult());
    expect((await failure(saved))?.code).toBe('MATCH_CANCELLED');
  });
});

describe('PAR-21: a seguinte da repetição nasce ao finalizar ou cancelar', () => {
  it('PAR-21, 43: finalizar a partida da repetição cria a seguinte na hora, na semana depois', async () => {
    const t = setup();
    const m = await createSeries(t);
    await start(t, m.id);
    expect(await t.service.list(BIA, PUBLIC_ID)).toHaveLength(1);
    await finish(t, m.id);
    const list = await t.service.list(BIA, PUBLIC_ID);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ startsAt: NEXT_START, seriesWeekday: 5 });
    expect(list[0]?.id).not.toBe(m.id);
    const next = await get(t, BIA, list[0]?.id ?? '');
    expect(next.series?.id).toBe((await get(t, BIA, m.id)).series?.id);
    expect(next.startedAt).toBeUndefined();
  });

  it('PAR-21, 07: cancelar a partida da repetição cria a seguinte na hora, sem esperar o fim marcado', async () => {
    const t = setup();
    const m = await createSeries(t);
    await t.service.cancel(ANA, PUBLIC_ID, m.id);
    const list = await t.service.list(BIA, PUBLIC_ID);
    expect(list.map((i) => i.startsAt).sort()).toEqual([START, NEXT_START]);
    expect(list.find((i) => i.id === m.id)?.status).toBe('cancelled');
  });

  it('PAR-21: sem finalizar nem cancelar, a seguinte não nasce, nem passada a hora, nem pela leitura ou pela rotina', async () => {
    const t = setup();
    const m = await createSeries(t);
    t.at(iso(END, 24 * 20));
    await t.service.runAgenda();
    await t.service.list(BIA, PUBLIC_ID);
    await get(t, BIA, m.id);
    expect((await t.service.list(BIA, PUBLIC_ID)).map((i) => i.id)).toEqual([m.id]);
  });

  it('PAR-21: iniciada e passada a hora, a seguinte também não nasce até finalizar', async () => {
    const t = setup();
    const m = await createSeries(t);
    await start(t, m.id);
    t.at(iso(END, 24 * 3));
    await t.service.runAgenda();
    expect((await t.service.list(BIA, PUBLIC_ID)).map((i) => i.id)).toEqual([m.id]);
  });

  it('PAR-21: duas pessoas finalizando ao mesmo tempo nunca criam duas', async () => {
    const t = setup();
    const m = await createSeries(t);
    await start(t, m.id);
    await Promise.allSettled([finish(t, m.id), finish(t, m.id)]);
    await t.service.runAgenda();
    const list = await t.service.list(BIA, PUBLIC_ID);
    expect(list).toHaveLength(1);
    expect(list[0]?.startsAt).toBe(NEXT_START);
  });

  it('PAR-21: finalizada dias depois, a seguinte cai na primeira semana que ainda está no futuro', async () => {
    const t = setup();
    const m = await createSeries(t);
    await start(t, m.id);
    t.at('2026-12-06T12:00:00.000Z');
    await finish(t, m.id);
    const list = await t.service.list(BIA, PUBLIC_ID);
    expect(list).toHaveLength(1);
    expect(list[0]?.startsAt).toBe('2026-12-11T22:00:00.000Z');
  });

  it('PAR-21, 23: com a repetição encerrada, finalizar não cria outra', async () => {
    const t = setup();
    const m = await createSeries(t);
    await t.service.endSeries(ANA, PUBLIC_ID, (await get(t, ANA, m.id)).series?.id ?? '');
    await start(t, m.id);
    await finish(t, m.id);
    expect(await t.service.list(BIA, PUBLIC_ID)).toHaveLength(0);
  });

  it('PAR-21: a seguinte nasce mesmo com as 20 partidas por vir, porque toma o lugar da que terminou', async () => {
    const t = setup();
    const m = await createSeries(t);
    for (const n of Array.from({ length: 19 }, (_, i) => i + 10)) {
      await create(t, iso(START, 24 * n), iso(END, 24 * n));
    }
    await start(t, m.id);
    await finish(t, m.id);
    expect(await t.service.list(BIA, PUBLIC_ID)).toHaveLength(20);
  });
});

describe('PAR-01, 15, 36: as próximas, o limite e o histórico pelo finalizar', () => {
  it('PAR-15: a partida que passou da hora e ninguém finalizou continua nas próximas, pelo início marcado', async () => {
    const t = setup();
    const a = await create(t);
    const b = await create(t, iso(START, 24), iso(END, 24));
    t.at(iso(END, 24 * 5));
    expect((await t.service.list(BIA, PUBLIC_ID)).map((i) => i.id)).toEqual([a.id, b.id]);
  });

  it('PAR-15, 07: a cancelada fica nas próximas até o fim marcado e depois some', async () => {
    const t = setup();
    const m = await create(t);
    await t.service.cancel(ANA, PUBLIC_ID, m.id);
    t.at(iso(END, -1));
    expect((await t.service.list(BIA, PUBLIC_ID)).map((i) => i.id)).toEqual([m.id]);
    t.at(iso(END, 1));
    expect(await t.service.list(BIA, PUBLIC_ID)).toHaveLength(0);
  });

  it('PAR-01: o limite de 20 por vir conta as que passaram da hora sem finalizar, e não as finalizadas nem as canceladas', async () => {
    const t = setup();
    const ids: string[] = [];
    for (const n of Array.from({ length: 20 }, (_, i) => i)) {
      ids.push((await create(t, iso(START, 24 * n), iso(END, 24 * n))).id);
    }
    t.at(iso(END, 24 * 30));
    expect((await failure(create(t, iso(START, 24 * 40), iso(END, 24 * 40))))?.code).toBe('MATCH_LIMIT');
    await t.service.cancel(ANA, PUBLIC_ID, ids[0] ?? '');
    await create(t, iso(START, 24 * 40), iso(END, 24 * 40));
    await start(t, ids[1] ?? '');
    await finish(t, ids[1] ?? '');
    await create(t, iso(START, 24 * 41), iso(END, 24 * 41));
    expect((await failure(create(t, iso(START, 24 * 42), iso(END, 24 * 42))))?.code).toBe('MATCH_LIMIT');
  });

  it('PAR-36: a finalizada entra no histórico na hora, mesmo antes do fim marcado, da mais recente para a mais antiga', async () => {
    const t = setup();
    const a = await create(t);
    const b = await create(t, iso(START, 24), iso(END, 24));
    await start(t, a.id);
    await start(t, b.id);
    await finish(t, a.id);
    await finish(t, b.id);
    const page = await t.service.history(BIA, PUBLIC_ID);
    expect(page.items.map((i) => i.id)).toEqual([b.id, a.id]);
    expect(page.items.every((i) => i.status === 'finished')).toBe(true);
  });

  it('PAR-36: a cancelada só entra no histórico depois do fim marcado; a iniciada e não finalizada nunca', async () => {
    const t = setup();
    const a = await create(t);
    const b = await create(t, iso(START, 24), iso(END, 24));
    await t.service.cancel(ANA, PUBLIC_ID, a.id);
    await start(t, b.id);
    expect((await t.service.history(BIA, PUBLIC_ID)).items).toHaveLength(0);
    t.at(iso(END, 1));
    const page = await t.service.history(BIA, PUBLIC_ID);
    expect(page.items.map((i) => [i.id, i.status])).toEqual([[a.id, 'cancelled']]);
    t.at(iso(END, 24 * 30));
    expect((await t.service.history(BIA, PUBLIC_ID)).items.map((i) => i.id)).toEqual([a.id]);
  });

  it('PAR-36: a finalizada de início marcado mais tarde vem primeiro, junto das canceladas que já passaram', async () => {
    const t = setup();
    const ids: string[] = [];
    for (const n of Array.from({ length: 20 }, (_, i) => i)) {
      ids.push((await create(t, iso(START, 24 * n), iso(END, 24 * n))).id);
    }
    const last = ids[19] ?? '';
    await start(t, last);
    await finish(t, last);
    for (const id of ids.slice(0, 5)) await t.service.cancel(ANA, PUBLIC_ID, id);
    t.at(iso(END, 24 * 30));
    const page = await t.service.history(BIA, PUBLIC_ID);
    expect(page.items).toHaveLength(6);
    expect(page.items[0]?.id).toBe(last);
  });
});

describe('PAR-16: a situação sai de startedAt e finishedAt', () => {
  it('PAR-16: a ordem é finished, in_progress e só então a hora (open, closed)', async () => {
    const t = setup();
    const m = await create(t);
    expect((await get(t, BIA, m.id)).status).toBe('open');
    t.at(iso(END, 1));
    expect((await get(t, BIA, m.id)).status).toBe('closed');
    await start(t, m.id);
    expect((await get(t, BIA, m.id)).status).toBe('in_progress');
    await finish(t, m.id);
    const done = await get(t, BIA, m.id);
    expect(done.status).toBe('finished');
    expect(done.startedAt).toBe(iso(END, 1));
    expect(done.finishedAt).toBe(iso(END, 1));
  });

  it('PAR-16: a lista das próximas mostra in_progress para a iniciada', async () => {
    const t = setup();
    const m = await create(t);
    await start(t, m.id);
    expect((await t.service.list(BIA, PUBLIC_ID)).find((i) => i.id === m.id)?.status).toBe('in_progress');
  });
});
