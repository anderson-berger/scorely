import { TeamRepository } from "./TeamRepository";
import {
  type Team,
  type NewTeam,
  $updateTeam,
} from "@scorely/shared/schemas/team/team_schemas";
import type { NewMember } from "@scorely/shared/schemas/team/member_schemas";
import type { User } from "@scorely/shared/schemas/user/user_schemas";
import type {
  PaginatedResult,
  PaginationQuery,
} from "@/utils/pagination/pagination";
import { generateId, generateTimestamp } from "@/utils/generators";
import { ConflictError, NotFoundError } from "@/utils/error/errors";
import { MemberService } from "@/modules/team/member/MemberService";

export class TeamService {
  private teamRepository = new TeamRepository();
  private memberService = new MemberService();

  async create(userId: User["id"], newTeam: NewTeam): Promise<Team> {
    const now = generateTimestamp();
    const team: Team = {
      id: generateId(),
      version: 1,
      createdAt: now,
      updatedAt: now,
      ...newTeam,
    };

    await this.teamRepository.create(team);

    const newMember: NewMember = {
      userId,
      teamId: team.id,
      role: "owner",
    };
    await this.memberService.create(newMember);

    return team;
  }

  async update(teamId: Team["id"], team: Team): Promise<Team> {
    const oldTeam = await this.teamRepository.findById(teamId);

    if (!oldTeam) {
      throw new NotFoundError();
    }

    if (team.version !== oldTeam.version) {
      throw new ConflictError();
    }

    const now = generateTimestamp();

    const updateTeam = $updateTeam.parse(team);
    const updatedTeam: Team = {
      ...oldTeam,
      version: oldTeam.version + 1,
      updatedAt: now,
      ...updateTeam,
    };

    return this.teamRepository.update(updatedTeam);
  }

  async findById(id: string): Promise<Team | null> {
    return this.teamRepository.findById(id);
  }

  async list(pagination: PaginationQuery): Promise<PaginatedResult<Team>> {
    return this.teamRepository.list(pagination);
  }
}
