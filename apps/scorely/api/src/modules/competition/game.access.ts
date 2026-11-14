import { appError } from '@scorely/api/src/lib/errors';
import { type Occurrence, occurrenceOnDate, type WeeklySchedule } from '@scorely/api/src/lib/zoned';
import type { StoredCompetition } from '@scorely/api/src/modules/competition/competition.repository';
import type { GameRecord, GameRepository } from '@scorely/api/src/modules/groups/game.repository';
import type { StoredGroup } from '@scorely/api/src/modules/groups/group.repository';
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

export function scheduleOf(group: StoredGroup): WeeklySchedule {
  return {
    weekday: group.weekday,
    time: group.time,
    timeZone: group.timeZone,
    listOpensHoursBefore: group.listOpensHoursBefore,
  };
}

/** O jogo da competição pela data: a mesma leitura no fechamento (CMP-11) e nas partidas (CMP-19). */
export function createGameAccess(deps: { games: GameRepository; teams: TeamsRepository; now: () => Date }) {
  return {
    /** CMP-11: a ocorrência da data, a partir da ativação. Outra data, ou de antes da ativação → GAME_NOT_FOUND. */
    occurrenceFor(group: StoredGroup, competition: StoredCompetition | undefined, date: string): Occurrence {
      const occ = occurrenceOnDate(scheduleOf(group), date);
      if (!occ || !competition || Date.parse(occ.startsAt) < Date.parse(competition.trialStartedAt)) {
        throw appError('GAME_NOT_FOUND');
      }
      return occ;
    },

    /** CMP-11: só jogo que virou item (GRP-10) e que já começou. */
    async startedGame(group: StoredGroup, occ: Occurrence): Promise<GameRecord> {
      const record = await deps.games.findByDate(group.id, occ.date);
      if (!record) throw appError('GAME_NOT_FOUND');
      if (Date.parse(occ.startsAt) > deps.now().getTime()) throw appError('GAME_NOT_STARTED');
      return record;
    },

    async listOf(group: StoredGroup, record: GameRecord): Promise<ListEntry[]> {
      const slots = record.slots ?? group.slots;
      const attendance = await deps.games.listAttendance(record.id);
      return attendance.map((a, i) => ({ id: a.userId, inside: i < slots }));
    },

    /** CMP-13, 20: só os times publicados contam; rascunho ou nada = sem times. */
    async publishedTeams(groupId: string, date: string): Promise<PublishedTeams> {
      const stored = await deps.teams.get(groupId, date);
      if (stored?.status !== 'published') return { teams: [], extras: [] };
      const inTeams = new Set(stored.teams.flat());
      const extras = (stored.extras ?? [])
        .filter((x) => inTeams.has(x.id))
        .map((x) => ({ id: x.id, name: x.name }));
      return { teams: stored.teams, extras };
    },
  };
}
