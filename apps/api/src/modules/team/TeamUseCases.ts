import { TeamService } from "@/modules/team/team/TeamService";
import { MemberService } from "@/modules/team/member/MemberService";
import { ForbiddenError, NotFoundError } from "@/utils/error/errors";
import type {
  Team,
  NewTeam,
  TeamWithMember,
} from "@/modules/team/team/team.schemas";
import { $teamWithMember } from "@/modules/team/team/team.schemas";
import type { Member } from "@/modules/team/member/member.schemas";
import type {
  PaginatedResult,
  PaginationQuery,
} from "@/utils/pagination/pagination";

export interface TeamWithOwner {
  team: Team;
  owner: Member;
}

export interface TeamWithMembers {
  team: Team;
  members: Member[];
}

export class TeamUseCases {
  private teamService = new TeamService();
  private memberService = new MemberService();

  async getMyTeams(
    userId: string,
    pagination: PaginationQuery,
  ): Promise<PaginatedResult<TeamWithMember>> {
    const membersResult = await this.memberService.findByUserId(
      userId,
      pagination,
    );

    const teamIds = membersResult.items
      .map((m) => m.teamId)
      .filter((id): id is string => !!id);

    const teams = await this.teamService.findByIds(teamIds);
    const teamsMap = new Map(teams.map((t) => [t.id, t]));

    const items: TeamWithMember[] = membersResult.items
      .filter((m) => m.teamId && teamsMap.has(m.teamId))
      .map((m) => ({
        ...teamsMap.get(m.teamId!)!,
        member: m,
      }));

    return {
      items,
      nextCursor: membersResult.nextCursor,
      hasMore: membersResult.hasMore,
    };
  }

  async createTeam(
    newTeam: NewTeam,
    requestedBy: string,
  ): Promise<TeamWithMember> {
    const team = await this.teamService.create(newTeam);

    const member = await this.memberService.create({
      teamId: team.id,
      userId: requestedBy,
      role: "owner",
    });

    // monta payload
    const payload = {
      ...team,
      member,
    };

    return $teamWithMember.parse(payload);
  }

  async getTeamWithMembers(
    teamId: string,
    pagination: PaginationQuery,
  ): Promise<TeamWithMembers> {
    const team = await this.teamService.findById(teamId);
    if (!team) {
      throw new NotFoundError("Team not found");
    }

    const membersResult = await this.memberService.findByTeamId(
      teamId,
      pagination,
    );

    return {
      team,
      members: membersResult.items,
    };
  }

  async deleteTeam(teamId: string, requestedBy: string): Promise<void> {
    const team = await this.teamService.findById(teamId);
    if (!team) {
      throw new NotFoundError("Team not found");
    }

    // Verifica se requestedBy é owner do time
    const member = await this.memberService.findByTeamAndUser(
      teamId,
      requestedBy,
    );
    if (!member || member.role !== "owner") {
      throw new ForbiddenError("Only the owner can delete the team");
    }

    // Deleta todos os membros primeiro
    await this.memberService.deleteAllByTeamId(teamId);

    // Depois deleta o team
    await this.teamService.delete(teamId);
  }

  async addMember(
    teamId: string,
    userId: string,
    requestedBy: string,
  ): Promise<Member> {
    const team = await this.teamService.findById(teamId);
    if (!team) {
      throw new NotFoundError("Team not found");
    }

    // Verifica se requestedBy é owner ou admin
    const requesterMember = await this.memberService.findByTeamAndUser(
      teamId,
      requestedBy,
    );
    if (
      !requesterMember ||
      !["owner", "admin"].includes(requesterMember.role!)
    ) {
      throw new ForbiddenError("Only owner or admin can add members");
    }

    return this.memberService.create({
      teamId,
      userId,
      role: "member",
    });
  }

  async removeMember(
    teamId: string,
    memberId: string,
    requestedBy: string,
  ): Promise<void> {
    const memberToRemove = await this.memberService.findById(teamId, memberId);
    if (!memberToRemove) {
      throw new NotFoundError("Member not found");
    }

    // Não pode remover o owner
    if (memberToRemove.role === "owner") {
      throw new ForbiddenError("Cannot remove the owner from the team");
    }

    // Verifica se requestedBy é owner, admin, ou o próprio membro saindo
    const requesterMember = await this.memberService.findByTeamAndUser(
      teamId,
      requestedBy,
    );
    const isSelf = memberToRemove.userId === requestedBy;
    const isOwnerOrAdmin =
      requesterMember && ["owner", "admin"].includes(requesterMember.role!);

    if (!isSelf && !isOwnerOrAdmin) {
      throw new ForbiddenError(
        "You don't have permission to remove this member",
      );
    }

    await this.memberService.delete(teamId, memberId);
  }

  async updateMemberRole(
    teamId: string,
    memberId: string,
    role: Member["role"],
    requestedBy: string,
  ): Promise<Member> {
    const memberToUpdate = await this.memberService.findById(teamId, memberId);
    if (!memberToUpdate) {
      throw new NotFoundError("Member not found");
    }

    // Apenas owner pode alterar roles
    const requesterMember = await this.memberService.findByTeamAndUser(
      teamId,
      requestedBy,
    );
    if (!requesterMember || requesterMember.role !== "owner") {
      throw new ForbiddenError("Only the owner can change member roles");
    }

    // Não pode alterar role do owner
    if (memberToUpdate.role === "owner") {
      throw new ForbiddenError("Cannot change the owner's role");
    }

    // Não pode promover alguém a owner
    if (role === "owner") {
      throw new ForbiddenError(
        "Cannot promote to owner. Use transfer ownership instead",
      );
    }

    return this.memberService.updateRole(teamId, memberId, role!);
  }
}
