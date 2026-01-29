import { generateId, generateTimestamp } from "@/utils/generators";
import { NotFoundError } from "@/utils/error/errors";
import { ParticipantRepository } from "./ParticipantRepository";
import type { Participant, NewParticipant } from "@scorely/shared/schemas/championship/participant_schemas";

export class ParticipantService {
  private participantRepository = new ParticipantRepository();

  async create(newParticipant: NewParticipant): Promise<Participant> {
    const now = generateTimestamp();
    const participant: Participant = {
      id: generateId(),
      version: 0,
      createdAt: now,
      updatedAt: now,
      ...newParticipant,
    };
    return this.participantRepository.create(participant);
  }

  async delete(championshipId: string, teamId: string): Promise<void> {
    const participant =
      await this.participantRepository.findByChampionshipAndTeam(
        championshipId,
        teamId,
      );

    if (!participant) {
      throw new NotFoundError();
    }

    return this.participantRepository.delete(championshipId, teamId);
  }

  async findByChampionshipAndTeam(
    championshipId: string,
    teamId: string,
  ): Promise<Participant | null> {
    return this.participantRepository.findByChampionshipAndTeam(
      championshipId,
      teamId,
    );
  }

  async findByChampionshipId(championshipId: string): Promise<Participant[]> {
    return this.participantRepository.findByChampionshipId(championshipId);
  }

  async findByTeamId(teamId: string): Promise<Participant[]> {
    return this.participantRepository.findByTeamId(teamId);
  }
}
