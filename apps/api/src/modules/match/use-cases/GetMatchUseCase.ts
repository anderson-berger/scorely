import { User } from "@/modules/user/user_types";
import { Match } from "@/modules/match/match_types";
import { MatchService } from "@/modules/match/match_service";
import { MatchUserService } from "@/modules/match/member/user/match_user_service";
import { NotFoundError } from "@/shared/error/errors";

export class GetMatchUseCase {
  private matchService = new MatchService();
  private matchUserService = new MatchUserService();

  async execute(matchId: Match["id"], requestedBy: User["id"]) {
    const match = await this.matchService.findById(matchId);
    if (!match) {
      throw new NotFoundError("Match not found");
    }

    const member = await this.matchUserService.findByMatchAndUser(
      matchId,
      requestedBy,
    );

    return { match, member };
  }
}
