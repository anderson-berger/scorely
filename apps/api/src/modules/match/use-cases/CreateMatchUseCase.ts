import { User } from "@/modules/user/user_types";
import { NewMatch } from "@/modules/match/match_types";
import { MatchService } from "@/modules/match/match_service";
import { MatchUserService } from "@/modules/match/member/user/match_user_service";
import type { NewMatchUser } from "@/modules/match/member/user/match_user_types";

export class CreateMatchUseCase {
  private matchService = new MatchService();
  private matchUserService = new MatchUserService();

  async execute(input: NewMatch, requestedBy: User["id"]) {
    const match = await this.matchService.create(input, requestedBy);

    const newMember: NewMatchUser = {
      userId: requestedBy,
      matchId: match.id,
      role: "OWNER",
      status: "CONFIRMED",
    };

    const member = await this.matchUserService.create(newMember);

    return { match, member };
  }
}
