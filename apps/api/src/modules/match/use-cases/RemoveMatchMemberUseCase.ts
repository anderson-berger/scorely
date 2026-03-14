import { User } from "@/modules/user/user_types";
import { Match } from "@/modules/match/match_types";
import { MatchUser } from "@/modules/match/member/user/match_user_types";
import { MatchUserService } from "@/modules/match/member/user/match_user_service";
import { ForbiddenError, NotFoundError } from "@/shared/error/errors";

export class RemoveMatchMemberUseCase {
  private matchUserService = new MatchUserService();

  async execute(
    matchId: Match["id"],
    matchUserId: MatchUser["id"],
    requestedBy: User["id"],
  ): Promise<void> {
    const memberToRemove = await this.matchUserService.findById(
      matchId,
      matchUserId,
    );
    if (!memberToRemove) {
      throw new NotFoundError("Member not found");
    }

    if (memberToRemove.role === "OWNER") {
      throw new ForbiddenError("Cannot remove the owner from the match");
    }

    const isSelf = memberToRemove.userId === requestedBy;

    const requester = await this.matchUserService.findByMatchAndUser(
      matchId,
      requestedBy,
    );
    const isOwnerOrAdmin =
      requester && ["OWNER", "ADMIN"].includes(requester.role);

    if (!isSelf && !isOwnerOrAdmin) {
      throw new ForbiddenError(
        "You don't have permission to remove this member",
      );
    }

    await this.matchUserService.delete(matchId, matchUserId);
  }
}
