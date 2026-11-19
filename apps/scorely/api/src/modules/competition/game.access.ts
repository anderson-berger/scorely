import { appError } from '@scorely/api/src/lib/errors';
import { layerOpensAt, type Occurrence } from '@scorely/api/src/lib/zoned';
import type { StoredCompetition } from '@scorely/api/src/modules/competition/competition.repository';
import type { GameRecord, GameRepository } from '@scorely/api/src/modules/groups/game.repository';
import type { StoredGroup } from '@scorely/api/src/modules/groups/group.repository';
import type { ScheduleRepository } from '@scorely/api/src/modules/groups/schedule.repository';
import type { TeamsRepository } from '@scorely/api/src/modules/teams/teams.repository';

/** Quem está na lista do jogo, na ordem: dentro (as primeiras vagas, GRP-19) ou fila. */
export interface ListEntry {
  id: string;
  inside: boolean;
}

/** Os times publicados do jogo, com os nomes dos avulsos que estão neles (TIM-10, 24). */
export interface PublishedTeams {
  teams: string[][];
  extras: { id: string; name: string }[];
}

/** A ocorrência guardada no jogo (GRP-10): o início e o fim de quando ele virou item. */
export function occurrenceOfGame(group: StoredGroup, record: GameRecord): Occurrence {
  return {
    date: record.date,
    startsAt: record.startsAt,
    opensAt: layerOpensAt(record.startsAt, group.listOpensHoursBefore),
    endsAt: record.endsAt,
  };
}

/** O jogo da competição pelo id: a mesma leitura no fechamento (CMP-11) e nas partidas (CMP-19). */
export function createGameAccess(deps: {
  games: GameRepository;
  teams: TeamsRepository;
  /** GRP-66: o horário do jogo, mesmo arquivado. Sem ele, só os ativos do grupo. */
  groupSchedules?: Pick<ScheduleRepository, 'get'> | undefined;
  now: () => Date;
}) {
  return {
    /**
     * CMP-11: só jogo do grupo que virou item (GRP-10), a partir da ativação, e que já começou. Outro jogo, de outro
     * grupo ou de antes da ativação → `GAME_NOT_FOUND`; ainda não começou → `GAME_NOT_STARTED`.
     */
    async startedGame(
      group: StoredGroup,
      competition: StoredCompetition | undefined,
      gameId: string,
    ): Promise<{ occ: Occurrence; record: GameRecord }> {
      const record = await deps.games.get(gameId);
      if (
        !record ||
        record.groupId !== group.id ||
        !competition ||
        Date.parse(record.startsAt) < Date.parse(competition.trialStartedAt)
      ) {
        throw appError('GAME_NOT_FOUND');
      }
      if (Date.parse(record.startsAt) > deps.now().getTime()) throw appError('GAME_NOT_STARTED');
      return { occ: occurrenceOfGame(group, record), record };
    },

    /** A lista do jogo, com as vagas que valiam (GRP-45, 66: o jogo, o horário ou o grupo). */
    async listOf(group: StoredGroup, record: GameRecord): Promise<ListEntry[]> {
      // GRP-66: o horário vale mesmo arquivado: o jogo passado continua com as vagas dele.
      const schedule =
        group.schedules.find((s) => s.id === record.scheduleId) ??
        (record.scheduleId === undefined
          ? undefined
          : await deps.groupSchedules?.get(group.id, record.scheduleId));
      const slots = record.slots ?? schedule?.slots ?? group.slots;
      const players = await deps.games.listPlayers(record.id);
      return players.map((a, i) => ({ id: a.userId, inside: i < slots }));
    },

    /** CMP-13, 20: só os times publicados contam; rascunho ou nada = sem times. */
    async publishedTeams(gameId: string): Promise<PublishedTeams> {
      const stored = await deps.teams.get(gameId);
      if (stored?.status !== 'published') return { teams: [], extras: [] };
      const inTeams = new Set(stored.teams.flat());
      const extras = (stored.extras ?? [])
        .filter((x) => inTeams.has(x.id))
        .map((x) => ({ id: x.id, name: x.name }));
      return { teams: stored.teams, extras };
    },
  };
}
