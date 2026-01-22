import { generateId, generateTimestamp } from "@/utils/generators";
import { MemberRepository } from "./MemberRepository";
import type { Member, NewMember } from "./member_schemas";

export class MemberService {
  private memberRepository = new MemberRepository();

  async create(newMember: NewMember): Promise<Member> {
    const now = generateTimestamp();
    const member: Member = {
      id: generateId(),
      createdAt: now,
      updatedAt: now,
      ...newMember,
    };
    return this.memberRepository.create(member);
  }
}
