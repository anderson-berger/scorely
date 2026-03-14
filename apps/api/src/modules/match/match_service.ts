import { MatchRepository } from "@/modules/match/repositories/MatchRepository";
import { generateId, generateTimestamp } from "@/utils/generators";
import { Match, NewMatch } from "@/modules/match/match_types";
import { User } from "@/modules/user/user_types";

export class MatchService {
  private matchRepository = new MatchRepository();

  async findById(id: Match["id"]): Promise<Match | null> {
    return this.matchRepository.findById(id);
  }

  async findByIds(ids: Match["id"][]): Promise<Match[]> {
    return this.matchRepository.findByIds(ids);
  }

  async create(input: NewMatch, createdBy: User["id"]): Promise<Match> {
    const match = this.buildNewMatch(input, createdBy);
    await this.matchRepository.create(match);
    return match;
  }

  async delete(id: Match["id"]): Promise<void> {
    return this.matchRepository.delete(id);
  }

  private buildNewMatch(input: NewMatch, createdBy: User["id"]): Match {
    const now = generateTimestamp();

    return {
      ...input,
      id: generateId(),
      version: 1,
      createdBy,
      status: "OPEN",
      createdAt: now,
      updatedAt: now,
    };
  }
}
