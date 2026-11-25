import { appError } from '@scorely/api/src/lib/errors';
import { asGroupId, asPublicGroupId, asUserId, type UserId } from '@scorely/api/src/lib/ids';
import type { GroupAccess } from '@scorely/api/src/modules/groups/group.access';
import { createMatchService } from '@scorely/api/src/modules/matches/match.service';
import { memoryMatches } from '@scorely/api/src/modules/matches/matches.memory';
import type { UserRecord } from '@scorely/api/src/modules/users/user.repository';
import {
  CreateMatchInputSchema,
  type GroupPermission,
  type GroupTier,
  type UpdateMatchInput,
} from '@scorely/contracts';
import { describe, expect, it } from 'vitest';

// Partidas, etapa 2: repetir toda semana (PAR-20–23) e o aviso de lista aberta (PAR-24).
// Repositório em memória, grupo falso e relógio fake. Os avisos são conferidos por tipo, destinatário e link.
// Nomes que o doc não fixa e que estes testes assumem: service.updateSeries(user, publicId, seriesId, input),
// service.endSeries(user, publicId, seriesId) e service.runAgenda() (a rotina `matchesAgenda`, PAR-21, 24).

const ANA = asUserId('11111111-1111-4111-8111-111111111111'); // Dono: matches.manage
const BIA = asUserId('22222222-2222-4222-8222-222222222222');
const CAIO = asUserId('33333333-3333-4333-8333-333333333333');
const DUDA = asUserId('44444444-4444-4444-8444-444444444444'); // reserva
const EDU = asUserId('55555555-5555-4555-8555-555555555555');
const PUBLIC_ID = asPublicGroupId('K3X9PQ2A');
const GROUP_ID = asGroupId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
const PUB = {
  [ANA]: '1AAAAAAA',
  [BIA]: '2BBBBBBB',
  [CAIO]: '3CCCCCCC',
  [DUDA]: '4DDDDDDD',
  [EDU]: '5EEEEEEE',
} as Record<string, string>;

const HOUR = 3_600_000;
const T0 = '2026-11-23T10:00:00.000Z';
/** Sexta, 27/11, 19h em São Paulo (UTC-3, sem horário de verão). */
const START = '2026-11-27T22:00:00.000Z';
const END = '2026-11-28T00:00:00.000Z';
const ZONE = 'America/Sao_Paulo';
/** A sexta seguinte, 04/12, 19h em São Paulo. */
const NEXT_START = '2026-12-04T22:00:00.000Z';
const NEXT_END = '2026-12-05T00:00:00.000Z';
const MEMBERS_AT = '2026-11-24T22:00:00.000Z'; // 72 h antes
const RESERVES_AT = '2026-11-26T22:00:00.000Z'; // 24 h antes
const UNKNOWN_SERIES = '00000000-0000-4000-8000-000000000000';
const iso = (base: string, hours: number) => new Date(Date.parse(base) + hours * HOUR).toISOString();

function setup() {
  const clock = { now: new Date(T0) };
  const sent: { userId: UserId; type: string; link?: string | undefined }[] = [];
  const state = {
    participants: new Map<UserId, GroupTier>([
      [ANA, 'member'],
      [BIA, 'member'],
      [CAIO, 'member'],
      [DUDA, 'reserve'],
      [EDU, 'member'],
    ]),
    managers: new Set<UserId>([ANA]),
  };
  const groups: GroupAccess = {
    access: async (userId, publicId) => {
      const tier = state.participants.get(userId);
      if (tier === undefined || publicId !== PUBLIC_ID) throw appError('GROUP_NOT_FOUND');
      const permissions: GroupPermission[] = state.managers.has(userId) ? ['matches.manage'] : [];
      return {
        groupId: GROUP_ID,
        publicId: PUBLIC_ID,
        name: 'Pelada de sexta',
        tier,
        permissions,
      };
    },
    participants: async () => new Map(state.participants),
    holders: async () => [...state.managers],
  };
  const users = {
    getMany: async (ids: readonly UserId[]): Promise<UserRecord[]> =>
      ids
        .filter((id) => PUB[id] !== undefined)
        .map((id) => ({
          id,
          publicId: PUB[id] as UserRecord['publicId'],
          nickname: (PUB[id] as string).toLowerCase(),
          createdAt: '2026-01-01T00:00:00.000Z',
          version: 1,
        })),
    resolve: async (publicIds: readonly UserRecord['publicId'][]) =>
      new Map(
        Object.entries(PUB)
          .filter(([, pub]) => publicIds.includes(pub as UserRecord['publicId']))
          .map(([id, pub]) => [pub as UserRecord['publicId'], id as UserId]),
      ),
  };
  const notifications = {
    notify: async (userId: UserId, n: { type: string; link?: string }) => {
      sent.push({ userId, type: n.type, link: n.link });
    },
  };
  const service = createMatchService({
    matches: memoryMatches().repo,
    groups,
    users,
    notifications: notifications as never,
    now: () => clock.now,
  });
  const at = (when: string) => {
    clock.now = new Date(when);
  };
  return { service, at, sent };
}
type T = ReturnType<typeof setup>;

type Settings = Omit<UpdateMatchInput, 'expectedVersion'>;
const settings = (over: Partial<Settings> = {}): Settings => ({
  startsAt: START,
  endsAt: END,
  membersHours: 72,
  reservesHours: 24,
  guestsHours: 6,
  noGuests: false,
  closeHours: 0,
  resultMode: 'day',
  ...over,
});

/** Cria a partida de sexta repetindo toda semana (PAR-01, 20). */
const createSeries = (t: T, over: { startsAt?: string; endsAt?: string } = {}) =>
  t.service.create(ANA, PUBLIC_ID, {
    startsAt: START,
    endsAt: END,
    repeatWeekly: true,
    timeZone: ZONE,
    ...over,
  });
/** Cria a partida avulsa e configura a abertura da lista, como a tela faz (PAR-06). */
async function createConfigured(t: T) {
  const first = await t.service.create(ANA, PUBLIC_ID, {
    startsAt: START,
    endsAt: END,
  });
  return t.service.update(ANA, PUBLIC_ID, first.id, {
    ...settings(),
    expectedVersion: first.version,
  });
}
const get = (t: T, user: UserId, matchId: string) => t.service.get(user, PUBLIC_ID, matchId);
const go = (t: T, user: UserId, matchId: string, status: 'going' | 'not_going' = 'going') =>
  t.service.setAttendance(user, PUBLIC_ID, matchId, { status });
const link = (matchId: string) => `/groups/${PUBLIC_ID}/matches/${matchId}`;
/** Os avisos `match_list_open` enviados a cada pessoa. */
const opened = (t: T, matchId?: string) =>
  t.sent.filter((n) => n.type === 'match_list_open' && (matchId === undefined || n.link === link(matchId)));
const openedTo = (t: T, user: UserId, matchId?: string) =>
  opened(t, matchId).filter((n) => n.userId === user);

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
    return undefined;
  } catch (err) {
    return err as { code: string; status: number; details?: unknown };
  }
}

/** A repetição que a partida trouxe (PAR-16). */
async function seriesOf(t: T, matchId: string) {
  const series = (await get(t, ANA, matchId)).series;
  if (series === undefined) throw new Error('The match has no series');
  return series;
}
/** As configurações da repetição (PAR-22), como a tela manda. */
const seriesInput = (version: number, over: Record<string, unknown> = {}) => ({
  weekday: 5,
  time: '19:00',
  durationMinutes: 120,
  noGuests: false,
  closeHours: 0,
  resultMode: 'day' as const,
  expectedVersion: version,
  ...over,
});

describe('PAR-20: a repetição é um molde que cria partidas de verdade', () => {
  it('PAR-20: criar com repeatWeekly nasce a repetição com dia da semana, hora, duração e fuso, sem formato nem abertura', async () => {
    const t = setup();
    const m = await createSeries(t);
    const series = await seriesOf(t, m.id);
    expect(series).toMatchObject({
      weekday: 5,
      time: '19:00',
      durationMinutes: 120,
      timeZone: ZONE,
      noGuests: false,
      closeHours: 0,
      version: 1,
    });
    expect(series.endedAt).toBeUndefined();
    expect(series.teams).toBeUndefined();
    expect(series.membersHours).toBeUndefined();
  });

  it('PAR-20: o dia e a hora vêm do fuso da repetição, não de UTC (sexta 19:00 em São Paulo, mesmo sendo sábado em UTC)', async () => {
    const t = setup();
    const m = await createSeries(t, {
      startsAt: '2026-11-28T01:30:00.000Z',
      endsAt: '2026-11-28T03:30:00.000Z',
    });
    expect(await seriesOf(t, m.id)).toMatchObject({
      weekday: 5,
      time: '22:30',
    });
  });

  it('PAR-20: sem repeatWeekly o timeZone é ignorado e não nasce repetição', async () => {
    const t = setup();
    const m = await t.service.create(ANA, PUBLIC_ID, {
      startsAt: START,
      endsAt: END,
      timeZone: 'Nada/Existe',
    });
    expect((await get(t, ANA, m.id)).series).toBeUndefined();
  });

  it('PAR-20: fuso que não existe, ou ausente com repeatWeekly, responde VALIDATION_ERROR (422)', async () => {
    const t = setup();
    const times = { startsAt: START, endsAt: END, repeatWeekly: true };
    expect(CreateMatchInputSchema.safeParse({ ...times, timeZone: 'Nada/Existe' }).success).toBe(false);
    expect(CreateMatchInputSchema.safeParse(times).success).toBe(false);
    const err = await failure(t.service.create(ANA, PUBLIC_ID, { ...times, timeZone: 'Nada/Existe' }));
    expect(err?.code).toBe('VALIDATION_ERROR');
    expect(err?.status).toBe(422);
  });

  it('PAR-20: o grupo tem no máximo 10 repetições ativas; a 11ª responde MATCH_SERIES_LIMIT (409, details.limit)', async () => {
    const t = setup();
    for (const n of Array.from({ length: 10 }, (_, i) => i)) {
      await createSeries(t, { startsAt: iso(START, n), endsAt: iso(END, n) });
    }
    const err = await failure(createSeries(t, { startsAt: iso(START, 10), endsAt: iso(END, 10) }));
    expect(err?.code).toBe('MATCH_SERIES_LIMIT');
    expect(err?.status).toBe(409);
    expect(err?.details).toMatchObject({ limit: 10 });
  });

  it('PAR-20: a repetição encerrada não conta no limite, e uma partida sem repetição não é barrada por ele', async () => {
    const t = setup();
    const first = await createSeries(t);
    await Promise.all(
      Array.from({ length: 9 }, (_, i) =>
        createSeries(t, {
          startsAt: iso(START, i + 1),
          endsAt: iso(END, i + 1),
        }),
      ),
    );
    expect(
      (
        await failure(
          t.service.create(ANA, PUBLIC_ID, {
            startsAt: iso(START, 30),
            endsAt: iso(END, 30),
          }),
        )
      )?.code,
    ).toBeUndefined();
    const series = await seriesOf(t, first.id);
    await t.service.endSeries(ANA, PUBLIC_ID, series.id);
    expect(
      (await failure(createSeries(t, { startsAt: iso(START, 40), endsAt: iso(END, 40) })))?.code,
    ).toBeUndefined();
  });

  it('PAR-20: criar com repetição exige matches.manage (GROUP_PERMISSION_DENIED, 403)', async () => {
    const t = setup();
    const err = await failure(
      t.service.create(BIA, PUBLIC_ID, {
        startsAt: START,
        endsAt: END,
        repeatWeekly: true,
        timeZone: ZONE,
      }),
    );
    expect(err?.code).toBe('GROUP_PERMISSION_DENIED');
    expect(err?.status).toBe(403);
  });

  it('PAR-15, 20: a partida de uma repetição ativa vem na lista com o dia da semana dela; a avulsa, sem', async () => {
    const t = setup();
    const m = await createSeries(t);
    const alone = await t.service.create(ANA, PUBLIC_ID, {
      startsAt: iso(START, 24),
      endsAt: iso(END, 24),
    });
    const list = await t.service.list(BIA, PUBLIC_ID);
    expect(list.find((x) => x.id === m.id)?.seriesWeekday).toBe(5);
    expect(list.find((x) => x.id === alone.id)?.seriesWeekday).toBeUndefined();
  });
});

describe('PAR-21: existe sempre só a próxima partida da repetição', () => {
  it('PAR-21: quando a partida termina, a seguinte nasce na semana depois, no mesmo dia e hora, com a mesma duração e a mesma repetição', async () => {
    const t = setup();
    const m = await createSeries(t);
    t.at(END);
    const list = await t.service.list(BIA, PUBLIC_ID);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      startsAt: NEXT_START,
      endsAt: NEXT_END,
      status: 'open',
      seriesWeekday: 5,
    });
    expect(list[0]?.id).not.toBe(m.id);
    const next = await get(t, BIA, list[0]?.id ?? '');
    expect(next.series?.id).toBe((await seriesOf(t, m.id)).id);
  });

  it('PAR-27: a partida que a repetição cria nasce sem times, mesmo com a anterior dividida', async () => {
    const t = setup();
    const m = await createSeries(t);
    t.at(iso(START, -1));
    await t.service.setAttendance(ANA, PUBLIC_ID, m.id, { status: 'going' });
    await t.service.setAttendance(BIA, PUBLIC_ID, m.id, { status: 'going' });
    const saved = await t.service.saveTeams(ANA, PUBLIC_ID, m.id, {
      teams: [[{ kind: 'user', id: PUB[ANA] as never }], [{ kind: 'user', id: PUB[BIA] as never }]],
      expectedVersion: 0,
    });
    expect(saved.lineup?.list).toHaveLength(2);
    t.at(END);
    const list = await t.service.list(BIA, PUBLIC_ID);
    const next = await get(t, BIA, list[0]?.id ?? '');
    expect(next.id).not.toBe(m.id);
    expect(next.lineup).toBeUndefined();
  });

  it('PAR-21: ler as partidas várias vezes não cria duas', async () => {
    const t = setup();
    await createSeries(t);
    t.at(END);
    await t.service.list(BIA, PUBLIC_ID);
    await t.service.list(CAIO, PUBLIC_ID);
    await t.service.runAgenda();
    expect(await t.service.list(ANA, PUBLIC_ID)).toHaveLength(1);
  });

  it('PAR-21: a rotina cria a seguinte até 15 min depois do fim, e a leitura depois não cria outra', async () => {
    const t = setup();
    await createSeries(t);
    t.at(iso(END, 0.25));
    await t.service.runAgenda();
    t.at(iso(END, 0.3));
    const list = await t.service.list(BIA, PUBLIC_ID);
    expect(list.map((m) => m.startsAt)).toEqual([NEXT_START]);
  });

  it('PAR-21: antes do fim a seguinte ainda não existe', async () => {
    const t = setup();
    await createSeries(t);
    t.at(iso(START, 1));
    expect(await t.service.list(BIA, PUBLIC_ID)).toHaveLength(1);
  });

  it('PAR-21, 07: a partida cancelada também faz a seguinte nascer', async () => {
    const t = setup();
    const m = await createSeries(t);
    await t.service.cancel(ANA, PUBLIC_ID, m.id);
    t.at(END);
    const list = await t.service.list(BIA, PUBLIC_ID);
    expect(list.map((x) => x.startsAt)).toEqual([NEXT_START]);
    expect(list[0]?.status).toBe('open');
  });

  it('PAR-21: com a rotina parada por semanas, a seguinte cai na primeira semana que ainda está no futuro', async () => {
    const t = setup();
    await createSeries(t);
    t.at('2026-12-20T12:00:00.000Z'); // domingo; 04, 11 e 18/12 já passaram
    const list = await t.service.list(BIA, PUBLIC_ID);
    expect(list.map((m) => m.startsAt)).toEqual(['2026-12-25T22:00:00.000Z']);
  });

  it('PAR-21, 06: editar o dia de uma partida não muda o dia das próximas', async () => {
    const t = setup();
    const m = await createSeries(t);
    await t.service.update(ANA, PUBLIC_ID, m.id, {
      ...settings({ startsAt: iso(START, 24), endsAt: iso(END, 24) }),
      membersHours: undefined,
      reservesHours: undefined,
      guestsHours: undefined,
      expectedVersion: m.version,
    });
    t.at(iso(END, 24));
    const list = await t.service.list(BIA, PUBLIC_ID);
    expect(list.map((x) => x.startsAt)).toEqual([NEXT_START]);
  });

  it('PAR-21: a seguinte nasce com o formato e a abertura que a repetição tem naquele momento', async () => {
    const t = setup();
    const m = await createSeries(t);
    const series = await seriesOf(t, m.id);
    await t.service.updateSeries(
      ANA,
      PUBLIC_ID,
      series.id,
      seriesInput(series.version, {
        teams: 2,
        playersPerTeam: 6,
        membersHours: 72,
        reservesHours: 24,
        guestsHours: 6,
      }),
    );
    t.at(END);
    const [next] = await t.service.list(BIA, PUBLIC_ID);
    expect(next).toMatchObject({ teams: 2, playersPerTeam: 6 });
    expect(await get(t, BIA, next?.id ?? '')).toMatchObject({
      membersHours: 72,
      reservesHours: 24,
      guestsHours: 6,
    });
  });

  it('PAR-21, 23: com a repetição encerrada, nenhuma nova nasce', async () => {
    const t = setup();
    const m = await createSeries(t);
    await t.service.endSeries(ANA, PUBLIC_ID, (await seriesOf(t, m.id)).id);
    t.at(END);
    await t.service.runAgenda();
    expect(await t.service.list(BIA, PUBLIC_ID)).toEqual([]);
  });
});

describe('PAR-22: mudar a repetição vale para as partidas criadas depois', () => {
  it('PAR-22: muda o dia, a hora e a duração; a version sobe; a próxima já criada não muda; a que nasce depois usa o novo', async () => {
    const t = setup();
    const m = await createSeries(t);
    const series = await seriesOf(t, m.id);
    await t.service.updateSeries(
      ANA,
      PUBLIC_ID,
      series.id,
      seriesInput(series.version, { time: '20:00', durationMinutes: 90 }),
    );
    expect(await seriesOf(t, m.id)).toMatchObject({
      time: '20:00',
      durationMinutes: 90,
      version: series.version + 1,
    });
    expect(await get(t, ANA, m.id)).toMatchObject({
      startsAt: START,
      endsAt: END,
    });
    t.at(END);
    const [next] = await t.service.list(BIA, PUBLIC_ID);
    expect(next).toMatchObject({
      startsAt: '2026-12-04T23:00:00.000Z',
      endsAt: '2026-12-05T00:30:00.000Z',
    });
  });

  it('PAR-22: o fuso não muda', async () => {
    const t = setup();
    const m = await createSeries(t);
    const series = await seriesOf(t, m.id);
    await t.service.updateSeries(
      ANA,
      PUBLIC_ID,
      series.id,
      seriesInput(series.version, { timeZone: 'Asia/Tokyo' }),
    );
    expect((await seriesOf(t, m.id)).timeZone).toBe(ZONE);
  });

  it('PAR-22: quem participa sem matches.manage recebe GROUP_PERMISSION_DENIED (403)', async () => {
    const t = setup();
    const m = await createSeries(t);
    const series = await seriesOf(t, m.id);
    const err = await failure(t.service.updateSeries(BIA, PUBLIC_ID, series.id, seriesInput(series.version)));
    expect(err?.code).toBe('GROUP_PERMISSION_DENIED');
    expect(err?.status).toBe(403);
  });

  it('PAR-22: version velha responde VERSION_CONFLICT (ADR 0016)', async () => {
    const t = setup();
    const m = await createSeries(t);
    const series = await seriesOf(t, m.id);
    await t.service.updateSeries(ANA, PUBLIC_ID, series.id, seriesInput(series.version));
    const err = await failure(t.service.updateSeries(ANA, PUBLIC_ID, series.id, seriesInput(series.version)));
    expect(err?.code).toBe('VERSION_CONFLICT');
  });

  it('PAR-22: repetição que não existe responde MATCH_SERIES_NOT_FOUND (404)', async () => {
    const t = setup();
    const err = await failure(t.service.updateSeries(ANA, PUBLIC_ID, UNKNOWN_SERIES, seriesInput(1)));
    expect(err?.code).toBe('MATCH_SERIES_NOT_FOUND');
    expect(err?.status).toBe(404);
  });

  it('PAR-22: repetição encerrada responde MATCH_SERIES_ENDED (409)', async () => {
    const t = setup();
    const m = await createSeries(t);
    const series = await seriesOf(t, m.id);
    await t.service.endSeries(ANA, PUBLIC_ID, series.id);
    const ended = await seriesOf(t, m.id);
    const err = await failure(t.service.updateSeries(ANA, PUBLIC_ID, series.id, seriesInput(ended.version)));
    expect(err?.code).toBe('MATCH_SERIES_ENDED');
    expect(err?.status).toBe(409);
  });
});

describe('PAR-23: encerrar a repetição e pular uma semana', () => {
  it('PAR-23: encerrar grava endedAt, a próxima que já existe continua e some a marca "Toda sexta" da lista', async () => {
    const t = setup();
    const m = await createSeries(t);
    const series = await seriesOf(t, m.id);
    await t.service.endSeries(ANA, PUBLIC_ID, series.id);
    expect((await seriesOf(t, m.id)).endedAt).toBe(T0);
    const [item] = await t.service.list(BIA, PUBLIC_ID);
    expect(item).toMatchObject({ id: m.id, status: 'open' });
    expect(item?.seriesWeekday).toBeUndefined();
  });

  it('PAR-23: encerrar de novo não muda nada (nem a version)', async () => {
    const t = setup();
    const m = await createSeries(t);
    const series = await seriesOf(t, m.id);
    await t.service.endSeries(ANA, PUBLIC_ID, series.id);
    const once = await seriesOf(t, m.id);
    t.at(iso(T0, 1));
    await t.service.endSeries(ANA, PUBLIC_ID, series.id);
    expect(await seriesOf(t, m.id)).toEqual(once);
  });

  it('PAR-23: sem matches.manage, GROUP_PERMISSION_DENIED; repetição inexistente, MATCH_SERIES_NOT_FOUND', async () => {
    const t = setup();
    const m = await createSeries(t);
    const series = await seriesOf(t, m.id);
    expect((await failure(t.service.endSeries(BIA, PUBLIC_ID, series.id)))?.code).toBe(
      'GROUP_PERMISSION_DENIED',
    );
    const err = await failure(t.service.endSeries(ANA, PUBLIC_ID, UNKNOWN_SERIES));
    expect(err?.code).toBe('MATCH_SERIES_NOT_FOUND');
    expect(err?.status).toBe(404);
  });

  it('PAR-23, 07: pular a semana é cancelar a partida: a repetição continua ativa e a seguinte nasce', async () => {
    const t = setup();
    const m = await createSeries(t);
    await t.service.cancel(ANA, PUBLIC_ID, m.id);
    expect((await seriesOf(t, m.id)).endedAt).toBeUndefined();
    t.at(END);
    expect((await t.service.list(BIA, PUBLIC_ID)).map((x) => x.startsAt)).toEqual([NEXT_START]);
  });
});

describe('PAR-24: aviso de lista aberta (match_list_open)', () => {
  it('PAR-24: a partida criada por uma pessoa não avisa ao nascer, mesmo com todas as ondas abertas', async () => {
    const t = setup();
    await t.service.create(ANA, PUBLIC_ID, { startsAt: START, endsAt: END });
    await t.service.runAgenda();
    expect(opened(t)).toEqual([]);
  });

  it('PAR-24: abrir à mão avisa na hora quem a onda deixou confirmar e ainda não respondeu, com o link; quem já respondeu, não', async () => {
    const t = setup();
    const m = await createConfigured(t);
    t.at(iso(MEMBERS_AT, 1 / 60));
    await go(t, BIA, m.id);
    await t.service.advance(ANA, PUBLIC_ID, m.id, { wave: 'reserves' });
    expect(openedTo(t, DUDA, m.id)).toEqual([{ userId: DUDA, type: 'match_list_open', link: link(m.id) }]);
    expect(openedTo(t, CAIO, m.id)).toHaveLength(1);
    expect(openedTo(t, EDU, m.id)).toHaveLength(1);
    expect(openedTo(t, BIA, m.id)).toEqual([]);
  });

  it('PAR-24: quem abriu à mão e ainda não respondeu também recebe o aviso', async () => {
    const t = setup();
    const m = await createConfigured(t);
    await t.service.advance(ANA, PUBLIC_ID, m.id, { wave: 'reserves' });
    expect(openedTo(t, ANA, m.id)).toEqual([{ userId: ANA, type: 'match_list_open', link: link(m.id) }]);
  });

  it('PAR-24, 06: quem abriu por uma edição e ainda não respondeu também recebe o aviso', async () => {
    const t = setup();
    const m = await createConfigured(t);
    t.at(iso(MEMBERS_AT, 1));
    const current = await get(t, ANA, m.id);
    await t.service.update(ANA, PUBLIC_ID, m.id, {
      ...settings({ reservesHours: 72 }),
      expectedVersion: current.version,
    });
    expect(openedTo(t, ANA, m.id)).toEqual([{ userId: ANA, type: 'match_list_open', link: link(m.id) }]);
  });

  it('PAR-24: quem disse "não vou" antes da onda abrir não é avisado', async () => {
    const t = setup();
    const m = await createConfigured(t);
    t.at(iso(MEMBERS_AT, 1 / 60));
    await go(t, EDU, m.id, 'not_going');
    await t.service.advance(ANA, PUBLIC_ID, m.id, { wave: 'reserves' });
    expect(openedTo(t, EDU, m.id)).toEqual([]);
  });

  it('PAR-24: uma vez por onda: abrir de novo a mesma onda não repete o aviso', async () => {
    const t = setup();
    const m = await createConfigured(t);
    await t.service.advance(ANA, PUBLIC_ID, m.id, { wave: 'reserves' });
    await t.service.advance(ANA, PUBLIC_ID, m.id, { wave: 'reserves' });
    expect(openedTo(t, DUDA, m.id)).toHaveLength(1);
    expect(openedTo(t, CAIO, m.id)).toHaveLength(1);
  });

  it('PAR-24: abrindo várias ondas juntas, cada pessoa recebe um aviso só', async () => {
    const t = setup();
    const m = await createConfigured(t);
    await t.service.advance(ANA, PUBLIC_ID, m.id, { wave: 'guests' });
    expect(openedTo(t, DUDA, m.id)).toHaveLength(1);
    expect(openedTo(t, CAIO, m.id)).toHaveLength(1);
  });

  it('PAR-24: a onda de convidados não avisa ninguém a mais (eles não têm conta)', async () => {
    const t = setup();
    const m = await createConfigured(t);
    await t.service.advance(ANA, PUBLIC_ID, m.id, { wave: 'reserves' });
    const before = opened(t, m.id).length;
    await t.service.advance(ANA, PUBLIC_ID, m.id, { wave: 'guests' });
    expect(opened(t, m.id)).toHaveLength(before);
  });

  it('PAR-24, 06: uma edição que abre uma onda avisa na hora', async () => {
    const t = setup();
    const m = await createConfigured(t);
    t.at(iso(MEMBERS_AT, 1)); // 71 h antes: só os membros abriram; as reservas abrem em 24 h
    const current = await get(t, ANA, m.id);
    await t.service.update(ANA, PUBLIC_ID, m.id, {
      ...settings({ reservesHours: 72 }),
      expectedVersion: current.version,
    });
    expect(openedTo(t, DUDA, m.id)).toHaveLength(1);
  });

  it('PAR-24: pela hora, a rotina avisa só quem não respondeu, uma vez por onda, e a seguinte avisa as reservas', async () => {
    const t = setup();
    const m = await createConfigured(t);
    t.at(MEMBERS_AT);
    await go(t, BIA, m.id);
    t.at(iso(MEMBERS_AT, 0.2));
    await t.service.runAgenda();
    expect(openedTo(t, CAIO, m.id)).toHaveLength(1);
    expect(openedTo(t, BIA, m.id)).toEqual([]);
    expect(openedTo(t, DUDA, m.id)).toEqual([]);
    t.at(iso(MEMBERS_AT, 0.4));
    await t.service.runAgenda();
    expect(openedTo(t, CAIO, m.id)).toHaveLength(1);
    t.at(iso(RESERVES_AT, 0.2));
    await t.service.runAgenda();
    expect(openedTo(t, DUDA, m.id)).toEqual([{ userId: DUDA, type: 'match_list_open', link: link(m.id) }]);
    expect(openedTo(t, CAIO, m.id)).toHaveLength(1);
  });

  it('PAR-24: a partida cancelada não avisa', async () => {
    const t = setup();
    const m = await createConfigured(t);
    await t.service.cancel(ANA, PUBLIC_ID, m.id);
    t.at(iso(MEMBERS_AT, 0.2));
    await t.service.runAgenda();
    expect(opened(t, m.id)).toEqual([]);
  });

  it('PAR-24, 21: a partida que a repetição cria avisa ao nascer as ondas que já estão abertas', async () => {
    const t = setup();
    const m = await createSeries(t);
    t.at(iso(END, 0.25));
    await t.service.runAgenda();
    const [next] = await t.service.list(BIA, PUBLIC_ID);
    expect(next?.id).not.toBe(m.id);
    expect(openedTo(t, BIA, next?.id)).toEqual([
      { userId: BIA, type: 'match_list_open', link: link(next?.id ?? '') },
    ]);
    expect(openedTo(t, DUDA, next?.id)).toHaveLength(1);
    expect(opened(t, m.id)).toEqual([]);
  });
});

describe('PAR-21, 24: casos de borda da repetição e do aviso', () => {
  it('PAR-21: a seguinte nasce mesmo com as 20 partidas por vir, porque toma o lugar da que terminou', async () => {
    const t = setup();
    await createSeries(t);
    t.at(END);
    for (const n of Array.from({ length: 20 }, (_, i) => i)) {
      await t.service.create(ANA, PUBLIC_ID, {
        startsAt: iso(START, 24 * (n + 10)),
        endsAt: iso(END, 24 * (n + 10)),
      });
    }
    const list = await t.service.list(BIA, PUBLIC_ID);
    expect(list).toHaveLength(21);
    expect(list.map((m) => m.startsAt)).toContain(NEXT_START);
  });

  it('PAR-21, 24: se a onda dos membros é de mais de uma semana, a lista abre quando a partida nasce, e os membros são avisados', async () => {
    const t = setup();
    const m = await createSeries(t);
    const series = await seriesOf(t, m.id);
    await t.service.updateSeries(
      ANA,
      PUBLIC_ID,
      series.id,
      seriesInput(series.version, { membersHours: 240, reservesHours: 24, guestsHours: 6 }),
    );
    t.at(iso(END, 0.25));
    await t.service.runAgenda();
    const [next] = await t.service.list(BIA, PUBLIC_ID);
    const nextId = next?.id ?? '';
    expect(nextId).not.toBe(m.id);
    expect((await go(t, BIA, nextId)).myAttendance).toBe('in');
    expect(openedTo(t, CAIO, nextId)).toEqual([
      { userId: CAIO, type: 'match_list_open', link: link(nextId) },
    ]);
    expect(openedTo(t, DUDA, nextId)).toEqual([]);
  });

  it('PAR-24, 06: a primeira configuração da abertura faz a onda que voltou a esperar avisar de novo ao abrir, uma vez só', async () => {
    const t = setup();
    const first = await t.service.create(ANA, PUBLIC_ID, { startsAt: START, endsAt: END });
    await t.service.runAgenda();
    expect(opened(t, first.id)).toEqual([]);
    await t.service.update(ANA, PUBLIC_ID, first.id, {
      ...settings(),
      expectedVersion: first.version,
    });
    expect(opened(t, first.id)).toEqual([]); // os membros voltaram a esperar (72 h antes)
    t.at(iso(MEMBERS_AT, 0.2));
    await t.service.runAgenda();
    expect(openedTo(t, CAIO, first.id)).toHaveLength(1);
    expect(openedTo(t, DUDA, first.id)).toEqual([]);
    t.at(iso(MEMBERS_AT, 0.4));
    await t.service.runAgenda();
    expect(openedTo(t, CAIO, first.id)).toHaveLength(1);
  });
});
