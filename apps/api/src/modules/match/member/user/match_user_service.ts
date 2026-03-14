import { MatchUserRepository } from "@/modules/match/member/user/repositories/match_user_repository";
import {
  NewMatchUser,
  MatchUser,
} from "@/modules/match/member/user/match_user_types";
import { generateId, generateTimestamp } from "@/utils/generators";
import { User } from "@/modules/user/user_types";
import { Match } from "@/modules/match/match_types";
import type {
  PaginatedResult,
  PaginationQuery,
} from "@/shared/pagination/pagination";

export class MatchUserService {
  private matchUserRepository = new MatchUserRepository();

  async create(newMatchUser: NewMatchUser): Promise<MatchUser> {
    const member = this.buildNewMatchUser(newMatchUser);
    await this.matchUserRepository.create(member);
    return member;
  }

  async findById(
    matchId: Match["id"],
    matchUserId: MatchUser["id"],
  ): Promise<MatchUser | null> {
    return this.matchUserRepository.findById(matchId, matchUserId);
  }

  async findByMatchId(
    matchId: Match["id"],
    query: PaginationQuery,
  ): Promise<PaginatedResult<MatchUser>> {
    return this.matchUserRepository.findByMatchId(matchId, query);
  }

  async findByMatchAndUser(
    matchId: Match["id"],
    userId: User["id"],
  ): Promise<MatchUser | null> {
    return this.matchUserRepository.findByMatchAndUser(matchId, userId);
  }

  async matchUserListByUserId(
    userId: User["id"],
    query: PaginationQuery,
  ): Promise<PaginatedResult<MatchUser>> {
    return this.matchUserRepository.matchUserListByUserId(userId, query);
  }

  async updateRole(
    matchId: Match["id"],
    matchUserId: MatchUser["id"],
    role: MatchUser["role"],
  ): Promise<MatchUser> {
    return this.matchUserRepository.updateRole(matchId, matchUserId, role);
  }

  async delete(
    matchId: Match["id"],
    matchUserId: MatchUser["id"],
  ): Promise<void> {
    return this.matchUserRepository.delete(matchId, matchUserId);
  }

  async deleteAllByMatchId(matchId: Match["id"]): Promise<void> {
    return this.matchUserRepository.deleteAllByMatchId(matchId);
  }

  private buildNewMatchUser(newMatchUser: NewMatchUser): MatchUser {
    const now = generateTimestamp();

    return {
      id: generateId(),
      version: 1,
      createdAt: now,
      updatedAt: now,
      ...newMatchUser,
    };
  }
}
