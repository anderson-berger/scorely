import { TeamRepository } from "@/modules/team/team/TeamRepository";
import { BadRequestError, NotFoundError } from "@/utils/error/errors";
import {
  $attributesTeam,
  type Team,
  type NewTeam,
} from "@/modules/team/team/team.schemas";
import type {
  PaginatedResult,
  PaginationQuery,
} from "@/utils/pagination/pagination";

export class TeamService {
  private teamRepository = new TeamRepository();

  async create(input: NewTeam): Promise<Team> {
    return this.teamRepository.create(input);
  }

  async findById(id: string): Promise<Team | null> {
    return this.teamRepository.findById(id);
  }

  async findByIds(ids: string[]): Promise<Team[]> {
    return this.teamRepository.findByIds(ids);
  }

  async list(pagination: PaginationQuery): Promise<PaginatedResult<Team>> {
    return this.teamRepository.list(pagination);
  }

  async update(teamId: string, input: Team): Promise<Team> {
    const currentTeam = await this.teamRepository.findById(teamId);
    if (!currentTeam) {
      throw new NotFoundError("Team not found");
    }

    if (input.version !== currentTeam.version) {
      throw new BadRequestError("Version mismatch");
    }

    const attributes = $attributesTeam.parse(input);

    return this.teamRepository.update(currentTeam, attributes);
  }

  async delete(teamId: string): Promise<void> {
    const team = await this.teamRepository.findById(teamId);
    if (!team) {
      throw new NotFoundError("Team not found");
    }

    return this.teamRepository.delete(teamId);
  }
}
