import { VersionSchema } from '@scorely/contracts/src/entity';
import { GroupTierSchema } from '@scorely/contracts/src/groups';
import { PublicUserIdSchema, TimeZoneSchema, UserSchema } from '@scorely/contracts/src/users';
import { z } from 'zod';

// Partida (docs/modules/partidas.md).

/** Máximo de partidas por vir (que não terminaram) por grupo (PAR-01). */
export const MATCH_MAX_UPCOMING = 20;

/** Máximo de convidados `pending` + `approved` por partida (PAR-12). */
export const MATCH_GUEST_MAX = 30;

/** Máximo de repetições ativas (não encerradas) por grupo (PAR-20). */
export const MATCH_SERIES_MAX_ACTIVE = 10;

/** Quantos times a divisão tem (PAR-25). */
export const MATCH_TEAMS_LIMITS = { min: 2, max: 10 } as const;

/** Limites de PAR-01 e PAR-03. */
export const MATCH_LIMITS = {
  /** O início fica no futuro, até 90 dias. */
  startMaxDays: 90,
  /** O fim fica até 24 h depois do início. */
  durationMaxHours: 24,
  teams: { min: 1, max: 10 },
  playersPerTeam: { min: 1, max: 50 },
  slots: 100,
  /** As horas das ondas e do fechamento: de 0 a 336 (14 dias). */
  waveMaxHours: 336,
  guestName: 40,
} as const;

/**
 * A duração no painel de criar e no "Dia e hora" (PAR-17, 18), em minutos: livre de 1 min até 24 h, e o padrão. A tela converte a duração no fim; a api recebe o início e o fim (PAR-01).
 */
export const MATCH_DURATION = {
  defaultMinutes: 120,
  minMinutes: 1,
} as const;

/** Uma onda (PAR-03): quem pode confirmar agora. */
export const MatchWaveSchema = z.enum(['members', 'reserves', 'guests']);
export type MatchWave = z.infer<typeof MatchWaveSchema>;

/** A onda que dá para abrir à mão (PAR-05). */
export const AdvanceMatchWaveSchema = z.enum(['reserves', 'guests']);
export type AdvanceMatchWave = z.infer<typeof AdvanceMatchWaveSchema>;

/** Situação da partida, calculada pela hora (PAR-16). */
export const MatchStatusSchema = z.enum([
  'scheduled',
  'open',
  'closed',
  'in_progress',
  'finished',
  'cancelled',
]);
export type MatchStatus = z.infer<typeof MatchStatusSchema>;

/** A resposta de quem participa (PAR-08). */
export const AttendanceStatusSchema = z.enum(['going', 'not_going']);
export type AttendanceStatus = z.infer<typeof AttendanceStatusSchema>;

/** Onde quem pede está na partida (PAR-17): dentro, na fila ou "não vou". Sem resposta: ausente. */
export const MyAttendanceSchema = z.enum(['in', 'queued', 'not_going']);
export type MyAttendance = z.infer<typeof MyAttendanceSchema>;

/** Situação do convidado (PAR-11). */
export const MatchGuestStatusSchema = z.enum(['pending', 'approved', 'declined', 'cancelled', 'removed']);
export type MatchGuestStatus = z.infer<typeof MatchGuestStatusSchema>;

/** O jeito do resultado (PAR-31): pelo dia ou por jogo. A partida e a repetição nascem `day`. */
export const MatchResultModeSchema = z.enum(['day', 'games']);
export type MatchResultMode = z.infer<typeof MatchResultModeSchema>;

const hours = z.number().int().min(0).max(MATCH_LIMITS.waveMaxHours);

/** O início e o fim (PAR-01): o que criar recebe. */
const MatchTimesSchema = z.object({
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
});
type MatchTimes = z.infer<typeof MatchTimesSchema>;

/**
 * As configurações da partida (PAR-06): o início e o fim, o formato, a abertura da lista e o jeito do resultado
 * (PAR-31, nasce `day`). O resto nasce vazio (PAR-01):
 * sem formato = sem limite (PAR-02); sem a hora de uma onda, ela abre com a anterior, e a dos membros desde a
 * criação (PAR-03).
 */
const MatchFieldsSchema = MatchTimesSchema.extend({
  /** O formato: os dois juntos, ou nenhum (PAR-02). */
  teams: z.number().int().min(MATCH_LIMITS.teams.min).max(MATCH_LIMITS.teams.max).optional(),
  playersPerTeam: z
    .number()
    .int()
    .min(MATCH_LIMITS.playersPerTeam.min)
    .max(MATCH_LIMITS.playersPerTeam.max)
    .optional(),
  membersHours: hours.optional(),
  reservesHours: hours.optional(),
  guestsHours: hours.optional(),
  /** "Sem convidados" (PAR-03, 12). */
  noGuests: z.boolean(),
  closeHours: hours,
  /** Como a tela do resultado abre (PAR-31). */
  resultMode: MatchResultModeSchema,
});
type MatchFields = z.infer<typeof MatchFieldsSchema>;

const HOUR_MS = 3_600_000;

/** PAR-01: o fim depois do início, até 24 h. O "início no futuro, até 90 dias" a api confere. */
function checkMatchTimes(value: MatchTimes, ctx: z.RefinementCtx): void {
  const duration = Date.parse(value.endsAt) - Date.parse(value.startsAt);
  if (duration <= 0 || duration > MATCH_LIMITS.durationMaxHours * HOUR_MS) {
    ctx.addIssue({
      code: 'custom',
      path: ['endsAt'],
      message: 'End must be after the start, up to 24 hours',
    });
  }
}

/** O formato e a abertura da lista (PAR-02–04): o que a partida (PAR-06) e a repetição (PAR-22) configuram. */
type MatchSetup = Pick<
  MatchFields,
  'teams' | 'playersPerTeam' | 'membersHours' | 'reservesHours' | 'guestsHours' | 'noGuests' | 'closeHours'
>;

/** PAR-06: as horas, o formato e a abertura. */
function checkMatchFields(value: MatchFields, ctx: z.RefinementCtx): void {
  checkMatchTimes(value, ctx);
  checkMatchSetup(value, ctx);
}

/**
 * PAR-02–04: o formato inteiro ou nenhum, as vagas até 100 e as ondas em ordem (membros ≥ reservas ≥ convidados ≥
 * fechamento), contando a onda sem hora como aberta junto com a anterior.
 */
function checkMatchSetup(value: MatchSetup, ctx: z.RefinementCtx): void {
  if ((value.teams === undefined) !== (value.playersPerTeam === undefined)) {
    ctx.addIssue({ code: 'custom', path: ['teams'], message: 'Teams and players per team go together' });
  } else if (value.teams !== undefined && value.teams * (value.playersPerTeam ?? 0) > MATCH_LIMITS.slots) {
    ctx.addIssue({ code: 'custom', path: ['playersPerTeam'], message: 'Too many slots' });
  }
  const members = value.membersHours ?? Number.POSITIVE_INFINITY;
  const reserves = value.reservesHours ?? members;
  const guests = value.guestsHours ?? reserves;
  if (reserves > members) {
    ctx.addIssue({ code: 'custom', path: ['reservesHours'], message: 'Reserves must open after members' });
  }
  if (!value.noGuests && guests > reserves) {
    ctx.addIssue({ code: 'custom', path: ['guestsHours'], message: 'Guests must open after reserves' });
  }
  if (value.closeHours > (value.noGuests ? reserves : guests)) {
    ctx.addIssue({ code: 'custom', path: ['closeHours'], message: 'Close must come after the last wave' });
  }
}

/**
 * Corpo do `POST /groups/{publicId}/matches` (PAR-01): só o início e o fim; o resto nasce vazio. Com `repeatWeekly`,
 * nasce também a repetição, no `timeZone` de quem cria (PAR-20), que aí é obrigatório e válido (a api guarda o nome
 * canônico, `TimeZoneSchema`). Sem o `repeatWeekly`, o `timeZone` é ignorado.
 */
export const CreateMatchInputSchema = MatchTimesSchema.extend({
  repeatWeekly: z.boolean().optional(),
  timeZone: z.string().optional(),
}).superRefine((value, ctx) => {
  checkMatchTimes(value, ctx);
  if (value.repeatWeekly === true && !TimeZoneSchema.safeParse(value.timeZone).success) {
    ctx.addIssue({ code: 'custom', path: ['timeZone'], message: 'Invalid time zone' });
  }
});
export type CreateMatchInput = z.infer<typeof CreateMatchInputSchema>;

/** Corpo do `PUT /groups/{publicId}/matches/{matchId}` (PAR-06): todas as configurações e a `version` (ADR 0016). */
export const UpdateMatchInputSchema = MatchFieldsSchema.extend({
  expectedVersion: VersionSchema,
}).superRefine(checkMatchFields);
export type UpdateMatchInput = z.infer<typeof UpdateMatchInputSchema>;

/** O dia da semana da repetição (PAR-20): 1 a 7, de segunda a domingo (ISO 8601). */
export const MatchWeekdaySchema = z.number().int().min(1).max(7);
export type MatchWeekday = z.infer<typeof MatchWeekdaySchema>;

/** A hora da repetição (PAR-20), `HH:mm`, no fuso dela. */
export const MatchSeriesTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid time');

/** O que a repetição configura (PAR-20, 22): o dia da semana, a hora, a duração, o formato, a abertura e o jeito do resultado. */
const MatchSeriesFieldsSchema = MatchFieldsSchema.omit({ startsAt: true, endsAt: true }).extend({
  weekday: MatchWeekdaySchema,
  time: MatchSeriesTimeSchema,
  /** De 1 min até 24 h (PAR-01, 17). */
  durationMinutes: z
    .number()
    .int()
    .min(MATCH_DURATION.minMinutes)
    .max(MATCH_LIMITS.durationMaxHours * 60),
});

/** Corpo do `PUT /groups/{publicId}/match-series/{seriesId}` (PAR-22): tudo, menos o fuso, e a `version` (ADR 0016). */
export const UpdateMatchSeriesInputSchema = MatchSeriesFieldsSchema.extend({
  expectedVersion: VersionSchema,
}).superRefine(checkMatchSetup);
export type UpdateMatchSeriesInput = z.infer<typeof UpdateMatchSeriesInputSchema>;

/** A repetição, como vem na partida que ela criou (PAR-16). */
export const MatchSeriesSchema = MatchSeriesFieldsSchema.extend({
  id: z.uuid(),
  /** O fuso de quem criou (PAR-20); não muda. */
  timeZone: z.string(),
  /** Encerrada (PAR-23); ausente = ativa. */
  endedAt: z.iso.datetime().optional(),
  version: VersionSchema,
});
export type MatchSeries = z.infer<typeof MatchSeriesSchema>;

/** Corpo do `POST .../advance` (PAR-05). */
export const AdvanceMatchInputSchema = z.object({ wave: AdvanceMatchWaveSchema });
export type AdvanceMatchInput = z.infer<typeof AdvanceMatchInputSchema>;

/** Corpo do `PUT .../attendance` (PAR-08). */
export const SetAttendanceInputSchema = z.object({ status: AttendanceStatusSchema });
export type SetAttendanceInput = z.infer<typeof SetAttendanceInputSchema>;

/** PAR-12: de 1 a 40 caracteres, sem os espaços das pontas. */
export const MatchGuestNameSchema = z.string().trim().min(1, 'Name is required').max(MATCH_LIMITS.guestName);

/** Corpo do `POST .../guests` (PAR-12). */
export const RequestMatchGuestInputSchema = z.object({ name: MatchGuestNameSchema });
export type RequestMatchGuestInput = z.infer<typeof RequestMatchGuestInputSchema>;

/** Um lugar na lista (PAR-09, 16): quem participa, com a participação, ou um convidado liberado. */
export const MatchEntrySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('player'), user: UserSchema, tier: GroupTierSchema }),
  z.object({
    kind: z.literal('guest'),
    guestId: z.uuid(),
    name: z.string(),
    /** Quem trouxe ("convidado de Fulano"). */
    requestedBy: UserSchema,
    /** Quem pede pode tirar este convidado (PAR-14). */
    removable: z.boolean(),
  }),
]);
export type MatchEntry = z.infer<typeof MatchEntrySchema>;

/** Quem disse "não vou" (PAR-16). */
export const MatchNotGoingSchema = z.object({ user: UserSchema, tier: GroupTierSchema });
export type MatchNotGoing = z.infer<typeof MatchNotGoingSchema>;

/** Um pedido de convidado esperando (PAR-12, 16): só para quem tem `matches.manage` e para quem pediu. */
export const MatchGuestRequestSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  requestedBy: UserSchema,
  createdAt: z.iso.datetime(),
  /** Quem pede pode liberar e recusar (PAR-13). */
  decidable: z.boolean(),
  /** Quem pede pode desistir do pedido (PAR-14: só quem pediu). */
  cancellable: z.boolean(),
});
export type MatchGuestRequest = z.infer<typeof MatchGuestRequestSchema>;

/** Uma pessoa num time, como vai ao salvar (PAR-25): o id público de quem tem conta, ou o id do convidado. */
export const MatchTeamPlayerRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('user'), id: PublicUserIdSchema }),
  z.object({ kind: z.literal('guest'), id: z.uuid() }),
]);
export type MatchTeamPlayerRef = z.infer<typeof MatchTeamPlayerRefSchema>;

/**
 * Uma pessoa de `MATCH_TEAM_PLAYER_OUT` (PAR-25): como foi enviada, com o nome achado pela api (apelido de quem tem
 * conta, nome do convidado). Sem `name` quando o id não é de ninguém ou a pessoa não tem mais perfil.
 */
export const MatchTeamPlayerOutSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('user'), id: PublicUserIdSchema, name: z.string().optional() }),
  z.object({ kind: z.literal('guest'), id: z.uuid(), name: z.string().optional() }),
]);
export type MatchTeamPlayerOut = z.infer<typeof MatchTeamPlayerOutSchema>;

/**
 * Corpo do `PUT .../teams` (PAR-25): os times, na ordem, cada um com as pessoas, e a `version` dos times que a tela
 * mostrou (0 sem times, ADR 0016). Cada pessoa num time só; de 2 a 10 times; um time pode ficar vazio.
 */
export const SaveMatchTeamsInputSchema = z
  .object({
    teams: z.array(z.array(MatchTeamPlayerRefSchema)).min(MATCH_TEAMS_LIMITS.min).max(MATCH_TEAMS_LIMITS.max),
    expectedVersion: VersionSchema,
  })
  .superRefine((value, ctx) => {
    const keys = value.teams.flat().map((p) => `${p.kind}:${p.id}`);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({ code: 'custom', path: ['teams'], message: 'A person can be in one team only' });
    }
  });
export type SaveMatchTeamsInput = z.infer<typeof SaveMatchTeamsInputSchema>;

/**
 * Uma pessoa num time salvo (PAR-27, 28), com a marca `left` de quem não está mais dentro. A participação (`tier`)
 * fica ausente para quem saiu do grupo. `gone` é quem não tem mais perfil, o convidado sem registro ou o convidado
 * de quem não tem mais perfil (PAR-28: "Pessoa removida"), sempre com `left`.
 */
export const MatchTeamMemberSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('gone'), left: z.literal(true) }),
  z.object({
    kind: z.literal('player'),
    user: UserSchema,
    tier: GroupTierSchema.optional(),
    left: z.boolean(),
  }),
  z.object({
    kind: z.literal('guest'),
    guestId: z.uuid(),
    name: z.string(),
    requestedBy: UserSchema,
    left: z.boolean(),
  }),
]);
export type MatchTeamMember = z.infer<typeof MatchTeamMemberSchema>;

/** Os times salvos da partida (PAR-16, 27, 28). */
export const MatchLineupSchema = z.object({
  /** Os times, na ordem ("Time 1", "Time 2"...), com as pessoas na ordem salva. */
  list: z.array(z.array(MatchTeamMemberSchema)),
  /** Quem está dentro e não está em nenhum time (PAR-28), na ordem da lista. */
  unassigned: z.array(MatchEntrySchema),
  /** Para o `expectedVersion` do salvar (PAR-25). */
  version: VersionSchema,
});
export type MatchLineup = z.infer<typeof MatchLineupSchema>;

// Resultado (PAR-31–35).

/** Limites do resultado por jogo (PAR-34). */
export const MATCH_RESULT_LIMITS = { games: { min: 1, max: 30 } } as const;

/** Pelo dia (PAR-33): o número do time que venceu (1 = Time 1) ou empate. */
export const MatchDayWinnerSchema = z.union([
  z.number().int().min(1).max(MATCH_TEAMS_LIMITS.max),
  z.literal('draw'),
]);
export type MatchDayWinner = z.infer<typeof MatchDayWinnerSchema>;

/** Por jogo (PAR-34): quem venceu o jogo, o Time A, o Time B ou empate. */
export const MatchGameWinnerSchema = z.enum(['a', 'b', 'draw']);
export type MatchGameWinner = z.infer<typeof MatchGameWinnerSchema>;

const personKey = (p: MatchTeamPlayerRef): string => `${p.kind}:${p.id}`;

const hasRepeated = (people: readonly MatchTeamPlayerRef[]): boolean =>
  new Set(people.map(personKey)).size !== people.length;

/** Um jogo, como vai ao salvar (PAR-34): o Time A e o Time B, com pelo menos 1 pessoa cada, e quem venceu. */
const MatchGameInputSchema = z.object({
  teams: z.tuple([z.array(MatchTeamPlayerRefSchema).min(1), z.array(MatchTeamPlayerRefSchema).min(1)]),
  winner: MatchGameWinnerSchema,
});

/**
 * Corpo do `PUT .../result` (PAR-32–34), pelo `mode`, com a `version` do resultado que a tela mostrou (0 sem
 * resultado, ADR 0016).
 * - `day`: de 2 a 10 times, cada pessoa num time só, `winner` até o número de times, e o time vencedor não vazio.
 * - `games`: de 1 a 30 jogos; em cada jogo, ninguém nos dois times (nem repetido no mesmo).
 */
export const SaveMatchResultInputSchema = z
  .discriminatedUnion('mode', [
    z.object({
      mode: z.literal('day'),
      teams: z
        .array(z.array(MatchTeamPlayerRefSchema))
        .min(MATCH_TEAMS_LIMITS.min)
        .max(MATCH_TEAMS_LIMITS.max),
      winner: MatchDayWinnerSchema,
      expectedVersion: VersionSchema,
    }),
    z.object({
      mode: z.literal('games'),
      games: z
        .array(MatchGameInputSchema)
        .min(MATCH_RESULT_LIMITS.games.min)
        .max(MATCH_RESULT_LIMITS.games.max),
      expectedVersion: VersionSchema,
    }),
  ])
  .superRefine((value, ctx) => {
    if (value.mode === 'day') {
      if (hasRepeated(value.teams.flat())) {
        ctx.addIssue({ code: 'custom', path: ['teams'], message: 'A person can be in one team only' });
      }
      if (value.winner !== 'draw') {
        const team = value.teams[value.winner - 1];
        if (team === undefined) {
          ctx.addIssue({ code: 'custom', path: ['winner'], message: 'Winner must be one of the teams' });
        } else if (team.length === 0) {
          ctx.addIssue({ code: 'custom', path: ['winner'], message: 'The winning team cannot be empty' });
        }
      }
      return;
    }
    value.games.forEach((game, index) => {
      if (hasRepeated(game.teams.flat())) {
        ctx.addIssue({
          code: 'custom',
          path: ['games', index, 'teams'],
          message: 'A person can be in one team only',
        });
      }
    });
  });
export type SaveMatchResultInput = z.infer<typeof SaveMatchResultInputSchema>;

/**
 * Uma pessoa do resultado (PAR-35), com o perfil, como nos times (PAR-27), mas sem a marca de quem saiu da lista:
 * quem está no resultado jogou. A participação (`tier`) fica ausente para quem saiu do grupo. `gone` é a "Pessoa
 * removida" (PAR-28).
 */
export const MatchResultMemberSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('gone') }),
  z.object({ kind: z.literal('player'), user: UserSchema, tier: GroupTierSchema.optional() }),
  z.object({ kind: z.literal('guest'), guestId: z.uuid(), name: z.string(), requestedBy: UserSchema }),
]);
export type MatchResultMember = z.infer<typeof MatchResultMemberSchema>;

/** A contagem de uma pessoa no resultado por jogo (PAR-34). */
export const MatchStandingSchema = z.object({
  member: MatchResultMemberSchema,
  played: z.number().int().positive(),
  wins: z.number().int().nonnegative(),
  draws: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
});
export type MatchStanding = z.infer<typeof MatchStandingSchema>;

/** O resultado da partida (PAR-35). `dayWinners` é quem venceu o dia (PAR-33, 34); vazio no empate. */
export const MatchResultSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('day'),
    /** Os times do resultado, na ordem ("Time 1", "Time 2"...). */
    teams: z.array(z.array(MatchResultMemberSchema)),
    winner: MatchDayWinnerSchema,
    dayWinners: z.array(MatchResultMemberSchema),
    version: VersionSchema,
  }),
  z.object({
    mode: z.literal('games'),
    /** Os jogos, na ordem (Jogo 1, Jogo 2...). */
    games: z.array(
      z.object({
        teams: z.tuple([z.array(MatchResultMemberSchema), z.array(MatchResultMemberSchema)]),
        winner: MatchGameWinnerSchema,
      }),
    ),
    /** A contagem, de quem mais venceu para quem menos venceu; no empate, na ordem em que apareceu nos jogos. */
    standings: z.array(MatchStandingSchema),
    dayWinners: z.array(MatchResultMemberSchema),
    version: VersionSchema,
  }),
]);
export type MatchResult = z.infer<typeof MatchResultSchema>;

/** Um jogo do resultado, em qualquer forma da pessoa (a ref da entrada, a gravada, a da saída). */
export type ResultGame<T> = { teams: readonly [readonly T[], readonly T[]]; winner: MatchGameWinner };

/** A contagem de uma pessoa, em qualquer forma da pessoa. */
export type ResultStanding<T> = { member: T; played: number; wins: number; draws: number; losses: number };

/**
 * PAR-34: a contagem de cada pessoa que jogou, a partir dos jogos. `key` identifica a pessoa (ex.: `kind:id`). A
 * ordem: mais vitórias primeiro; no empate, na ordem em que a pessoa apareceu nos jogos (a tela desempata pelo
 * apelido, PAR-38).
 */
export function resultStandings<T>(
  games: readonly ResultGame<T>[],
  key: (person: T) => string,
): ResultStanding<T>[] {
  const tally = new Map<string, ResultStanding<T>>();
  for (const game of games) {
    for (const [side, team] of [
      ['a', game.teams[0]],
      ['b', game.teams[1]],
    ] as const) {
      for (const person of team) {
        const k = key(person);
        const current = tally.get(k) ?? { member: person, played: 0, wins: 0, draws: 0, losses: 0 };
        tally.set(k, {
          ...current,
          played: current.played + 1,
          wins: current.wins + (game.winner === side ? 1 : 0),
          draws: current.draws + (game.winner === 'draw' ? 1 : 0),
          losses: current.losses + (game.winner !== side && game.winner !== 'draw' ? 1 : 0),
        });
      }
    }
  }
  return [...tally.values()].sort((x, y) => y.wins - x.wins);
}

/** O resultado de que `dayWinners` precisa, em qualquer forma da pessoa. */
export type ResultForWinners<T> =
  | { mode: 'day'; teams: readonly (readonly T[])[]; winner: MatchDayWinner }
  | { mode: 'games'; games: readonly ResultGame<T>[] };

/**
 * PAR-33, 34: quem venceu o dia. Pelo dia, as pessoas do time vencedor (no empate, ninguém). Por jogo, quem tem mais
 * vitórias, se tiver pelo menos uma; com empate nas vitórias, todos os empatados, na ordem da contagem.
 */
export function dayWinners<T>(result: ResultForWinners<T>, key: (person: T) => string): T[] {
  if (result.mode === 'day') {
    return result.winner === 'draw' ? [] : [...(result.teams[result.winner - 1] ?? [])];
  }
  const standings = resultStandings(result.games, key);
  const best = standings[0]?.wins ?? 0;
  return best === 0 ? [] : standings.filter((s) => s.wins === best).map((s) => s.member);
}

/** A hora em que cada onda abre e a lista fecha (PAR-03, 04), já com o que foi aberto à mão (PAR-05). */
export const MatchWavesSchema = z.object({
  members: z.iso.datetime(),
  reserves: z.iso.datetime(),
  /** Ausente = "sem convidados" e ainda não aberta à mão. */
  guests: z.iso.datetime().optional(),
  close: z.iso.datetime(),
});
export type MatchWaves = z.infer<typeof MatchWavesSchema>;

/** A partida na lista (PAR-15). */
export const MatchSummarySchema = z.object({
  id: z.uuid(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  /** O formato; ausente = sem limite de vagas (PAR-02). */
  teams: z.number().int().positive().optional(),
  playersPerTeam: z.number().int().positive().optional(),
  status: MatchStatusSchema,
  /** A onda aberta agora; ausente antes da onda dos membros (só com a hora dela configurada). */
  wave: MatchWaveSchema.optional(),
  /** Quantos estão dentro (PAR-09). */
  confirmed: z.number().int().nonnegative(),
  myAttendance: MyAttendanceSchema.optional(),
  /** O dia da semana da repetição de onde a partida saiu, só com ela ativa (PAR-15, 17: "Toda sexta"). */
  seriesWeekday: MatchWeekdaySchema.optional(),
});
export type MatchSummary = z.infer<typeof MatchSummarySchema>;

/** O que quem pede pode fazer agora (PAR-16). A tela só mostra essas ações; a api confere de novo. */
export const MatchActionsSchema = z.object({
  /** Dizer "vou" (PAR-08). */
  going: z.boolean(),
  /** Dizer "não vou" (PAR-08). */
  notGoing: z.boolean(),
  /** Pedir convidado (PAR-12). */
  requestGuest: z.boolean(),
  /** Tem `matches.manage` (editar, cancelar, abrir onda, decidir convidados), com a partida ainda não começada. */
  manage: z.boolean(),
  /** Tem `matches.manage`, com a partida não terminada nem cancelada: dividir ou mudar os times (PAR-25, 30). */
  manageTeams: z.boolean(),
  /** Tem `matches.manage`, a partir do início e sem prazo, na partida não cancelada: registrar ou corrigir o resultado (PAR-32). */
  recordResult: z.boolean(),
});
export type MatchActions = z.infer<typeof MatchActionsSchema>;

/** A partida como a página mostra (PAR-16). Toda ação sobre a partida responde com ela de novo. */
export const MatchSchema = MatchSummarySchema.extend({
  createdAt: z.iso.datetime(),
  version: VersionSchema,
  /** A abertura da lista como foi configurada (PAR-03); a hora ausente não foi configurada. */
  membersHours: hours.optional(),
  reservesHours: hours.optional(),
  guestsHours: hours.optional(),
  noGuests: z.boolean(),
  closeHours: hours,
  /** As horas em que cada onda abre, já calculadas (a sem hora configurada abre com a anterior, ou na criação). */
  waves: MatchWavesSchema,
  cancelledAt: z.iso.datetime().optional(),
  /** Dentro, na ordem (PAR-09). */
  in: z.array(MatchEntrySchema),
  /** A fila, na ordem (PAR-09). */
  queue: z.array(MatchEntrySchema),
  notGoing: z.array(MatchNotGoingSchema),
  /** Os pedidos de convidado `pending` que quem pede pode ver. */
  guestRequests: z.array(MatchGuestRequestSchema),
  actions: MatchActionsSchema,
  /** A repetição de onde a partida saiu, encerrada ou não (PAR-16, 22). */
  series: MatchSeriesSchema.optional(),
  /** Os times salvos (PAR-27); ausente sem times. */
  lineup: MatchLineupSchema.optional(),
  /** O jeito do resultado configurado (PAR-31). */
  resultMode: MatchResultModeSchema,
  /** O resultado (PAR-35); ausente sem resultado. */
  result: MatchResultSchema.optional(),
});
export type Match = z.infer<typeof MatchSchema>;

// Histórico (PAR-36).

/** Tamanho da página do histórico (PAR-36). */
export const MATCH_HISTORY_PAGE_SIZE = 20;

/** O resumo do resultado no histórico (PAR-36, 37): pelo dia, o time que venceu; por jogo, quem venceu o dia. */
export const MatchHistoryResultSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('day'), winner: MatchDayWinnerSchema }),
  z.object({ mode: z.literal('games'), dayWinners: z.array(MatchResultMemberSchema) }),
]);
export type MatchHistoryResult = z.infer<typeof MatchHistoryResultSchema>;

/** Uma partida que terminou (PAR-36). */
export const MatchHistoryItemSchema = z.object({
  id: z.uuid(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  status: z.enum(['finished', 'cancelled']),
  /** Quantos estão dentro (PAR-09), pela lista de agora. */
  confirmed: z.number().int().nonnegative(),
  /** Ausente sem resultado. */
  result: MatchHistoryResultSchema.optional(),
});
export type MatchHistoryItem = z.infer<typeof MatchHistoryItemSchema>;

/** Resposta do `GET /groups/{publicId}/matches/history?cursor=` (PAR-36): da mais recente para a mais antiga. */
export const MatchHistoryPageSchema = z.object({
  items: z.array(MatchHistoryItemSchema),
  /** Ausente na última página. */
  nextCursor: z.string().optional(),
});
export type MatchHistoryPage = z.infer<typeof MatchHistoryPageSchema>;
