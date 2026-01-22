import { TeamRepository } from "./TeamRepository";
import type { Team, NewTeam } from "./team_schemas";
import type {
  PaginatedResult,
  PaginationQuery,
} from "@/utils/pagination/pagination";
import { generateId, generateTimestamp } from "@/utils/generators";

export class TeamService {
  private teamRepository = new TeamRepository();

  async create(newTeam: NewTeam): Promise<Team> {
    const now = generateTimestamp();
    const team: Team = {
      id: generateId(),
      createdAt: now,
      updatedAt: now,
      ...newTeam,
    };
    return this.teamRepository.create(team);
  }

  async findById(id: string): Promise<Team | null> {
    return this.teamRepository.findById(id);
  }

  async list(pagination: PaginationQuery): Promise<PaginatedResult<Team>> {
    return this.teamRepository.list(pagination);
  }
}
