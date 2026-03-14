import { User } from "@/modules/user/user_types";
import { Match } from "@/modules/match/match_types";
import { MatchService } from "@/modules/match/match_service";
import { MatchUser } from "@/modules/match/member/user/match_user_types";
import { MatchUserService } from "@/modules/match/member/user/match_user_service";
import { ForbiddenError, NotFoundError } from "@/shared/error/errors";

export class AddMatchMemberUseCase {
  private matchService = new MatchService();
  private matchUserService = new MatchUserService();

  async execute(
    matchId: Match["id"],
    userId: User["id"],
    requestedBy: User["id"],
  ): Promise<MatchUser> {
    const match = await this.matchService.findById(matchId);
    if (!match) {
      throw new NotFoundError("Match not found");
    }

    const requester = await this.matchUserService.findByMatchAndUser(
      matchId,
      requestedBy,
    );
    if (!requester || !["OWNER", "ADMIN"].includes(requester.role)) {
      throw new ForbiddenError("Only owner or admin can add members");
    }

    return this.matchUserService.create({
      matchId,
      userId,
      role: "MEMBER",
      status: "INVITED",
    });
  }
}
