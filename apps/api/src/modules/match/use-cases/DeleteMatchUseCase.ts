import { User } from "@/modules/user/user_types";
import { Match } from "@/modules/match/match_types";
import { MatchService } from "@/modules/match/match_service";
import { MatchUserService } from "@/modules/match/member/user/match_user_service";
import { ForbiddenError, NotFoundError } from "@/shared/error/errors";

export class DeleteMatchUseCase {
  private matchService = new MatchService();
  private matchUserService = new MatchUserService();

  async execute(matchId: Match["id"], requestedBy: User["id"]): Promise<void> {
    const match = await this.matchService.findById(matchId);
    if (!match) {
      throw new NotFoundError("Match not found");
    }

    const requester = await this.matchUserService.findByMatchAndUser(
      matchId,
      requestedBy,
    );
    if (!requester || requester.role !== "OWNER") {
      throw new ForbiddenError("Only the owner can delete the match");
    }

    await this.matchUserService.deleteAllByMatchId(matchId);
    await this.matchService.delete(matchId);
  }
}
