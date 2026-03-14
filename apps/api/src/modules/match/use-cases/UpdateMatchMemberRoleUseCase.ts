import { User } from "@/modules/user/user_types";
import { Match } from "@/modules/match/match_types";
import { MatchUser } from "@/modules/match/member/user/match_user_types";
import { MatchUserService } from "@/modules/match/member/user/match_user_service";
import { ForbiddenError, NotFoundError } from "@/shared/error/errors";

export class UpdateMatchMemberRoleUseCase {
  private matchUserService = new MatchUserService();

  async execute(
    matchId: Match["id"],
    matchUserId: MatchUser["id"],
    role: MatchUser["role"],
    requestedBy: User["id"],
  ): Promise<MatchUser> {
    const memberToUpdate = await this.matchUserService.findById(
      matchId,
      matchUserId,
    );
    if (!memberToUpdate) {
      throw new NotFoundError("Member not found");
    }

    const requester = await this.matchUserService.findByMatchAndUser(
      matchId,
      requestedBy,
    );
    if (!requester || requester.role !== "OWNER") {
      throw new ForbiddenError("Only the owner can change member roles");
    }

    if (memberToUpdate.role === "OWNER") {
      throw new ForbiddenError("Cannot change the owner's role");
    }

    if (role === "OWNER") {
      throw new ForbiddenError("Cannot promote to owner");
    }

    return this.matchUserService.updateRole(matchId, matchUserId, role);
  }
}
