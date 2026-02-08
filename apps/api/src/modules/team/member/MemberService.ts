import { MemberRepository } from "@/modules/team/member/MemberRepository";
import { ConflictError, NotFoundError } from "@/utils/error/errors";
import {
  type Member,
  type NewMember,
  type MemberRole,
} from "@/modules/team/member/member.schemas";
import type {
  PaginatedResult,
  PaginationQuery,
} from "@/utils/pagination/pagination";

export class MemberService {
  private memberRepository = new MemberRepository();

  async create(input: NewMember): Promise<Member> {
    const existingMember = await this.memberRepository.findByTeamAndUser(
      input.teamId,
      input.userId,
    );

    if (existingMember) {
      throw new ConflictError("User is already a member of this team");
    }

    return this.memberRepository.create(input);
  }

  async findById(teamId: string, memberId: string): Promise<Member | null> {
    return this.memberRepository.findById(teamId, memberId);
  }

  async findByTeamAndUser(teamId: string, userId: string): Promise<Member | null> {
    return this.memberRepository.findByTeamAndUser(teamId, userId);
  }

  async findByTeamId(
    teamId: string,
    pagination: PaginationQuery,
  ): Promise<PaginatedResult<Member>> {
    return this.memberRepository.findByTeamId(teamId, pagination);
  }

  async findByUserId(
    userId: string,
    pagination: PaginationQuery,
  ): Promise<PaginatedResult<Member>> {
    return this.memberRepository.findByUserId(userId, pagination);
  }

  async updateRole(teamId: string, memberId: string, role: MemberRole): Promise<Member> {
    const currentMember = await this.memberRepository.findById(teamId, memberId);
    if (!currentMember) {
      throw new NotFoundError("Member not found");
    }

    return this.memberRepository.update(currentMember, { role });
  }

  async delete(teamId: string, memberId: string): Promise<void> {
    const member = await this.memberRepository.findById(teamId, memberId);
    if (!member) {
      throw new NotFoundError("Member not found");
    }

    return this.memberRepository.delete(teamId, memberId);
  }

  async deleteAllByTeamId(teamId: string): Promise<void> {
    return this.memberRepository.deleteAllByTeamId(teamId);
  }
}
