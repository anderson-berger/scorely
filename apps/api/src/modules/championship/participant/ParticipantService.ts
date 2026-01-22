import { generateId, generateTimestamp } from "@/utils/generators";
import { ParticipantRepository } from "./ParticipantRepository";
import type { Participant, NewParticipant } from "./participant_schemas";

export class ParticipantService {
  private participantRepository = new ParticipantRepository();

  async create(newParticipant: NewParticipant): Promise<Participant> {
    const now = generateTimestamp();
    const participant: Participant = {
      id: generateId(),
      createdAt: now,
      updatedAt: now,
      ...newParticipant,
    };
    return this.participantRepository.create(participant);
  }
}
