import { generateId, generateTimestamp } from "@/utils/generators";
import { ConflictError, NotFoundError } from "@/utils/error/errors";
import { MemberRepository } from "./MemberRepository";
import type { Member, NewMember } from "@scorely/shared/schemas/team";

export class MemberService {
  private memberRepository = new MemberRepository();

  async create(newMember: NewMember): Promise<Member> {
    const now = generateTimestamp();
    const member: Member = {
      id: generateId(),
      version: 0,
      createdAt: now,
      updatedAt: now,
      ...newMember,
    };
    return this.memberRepository.create(member);
  }

  async update(
    teamId: string,
    userId: string,
    member: Member,
  ): Promise<Member> {
    const oldMember = await this.memberRepository.findByTeamAndUser(
      teamId,
      userId,
    );

    if (!oldMember) {
      throw new NotFoundError();
    }

    if (member.version !== oldMember.version) {
      throw new ConflictError();
    }

    const now = generateTimestamp();
    const updatedMember: Member = {
      ...oldMember,
      role: member.role,
      version: oldMember.version + 1,
      updatedAt: now,
    };

    return this.memberRepository.update(updatedMember);
  }

  async delete(teamId: string, userId: string): Promise<void> {
    const member = await this.memberRepository.findByTeamAndUser(
      teamId,
      userId,
    );

    if (!member) {
      throw new NotFoundError();
    }

    return this.memberRepository.delete(teamId, userId);
  }

  async findByTeamAndUser(
    teamId: string,
    userId: string,
  ): Promise<Member | null> {
    return this.memberRepository.findByTeamAndUser(teamId, userId);
  }

  async findByTeamId(teamId: string): Promise<Member[]> {
    return this.memberRepository.findByTeamId(teamId);
  }

  async findByUserId(userId: string): Promise<Member[]> {
    return this.memberRepository.findByUserId(userId);
  }
}
