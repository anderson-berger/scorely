import { User } from "@/modules/user/user_types";
import { MatchService } from "@/modules/match/match_service";
import { MatchUserService } from "@/modules/match/member/user/match_user_service";
import {
  PaginatedResult,
  PaginationQuery,
} from "@/shared/pagination/pagination";
import { Match } from "@/modules/match/match_types";

export class FindMyMatchesUseCase {
  private matchService = new MatchService();
  private matchUserService = new MatchUserService();

  async execute(
    userId: User["id"],
    query: PaginationQuery,
  ): Promise<PaginatedResult<Match>> {
    const matchUsersPage = await this.matchUserService.matchUserListByUserId(
      userId,
      query,
    );

    const matchIds = matchUsersPage.items.map((match) => match.matchId);
    const matches = await this.matchService.findByIds(matchIds);

    return {
      items: matches,
      nextCursor: matchUsersPage.nextCursor,
      hasMore: matchUsersPage.hasMore,
    };
  }
}
