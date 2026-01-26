import { generateId, generateTimestamp } from "@/utils/generators";
import { ConflictError, NotFoundError } from "@/utils/error/errors";
import { OrganizerRepository } from "./OrganizerRepository";
import type { Organizer, NewOrganizer } from "@scorely/shared/schemas/championship";

export class OrganizerService {
  private organizerRepository = new OrganizerRepository();

  async create(newOrganizer: NewOrganizer): Promise<Organizer> {
    const now = generateTimestamp();
    const organizer: Organizer = {
      id: generateId(),
      version: 0,
      createdAt: now,
      updatedAt: now,
      ...newOrganizer,
    };
    return this.organizerRepository.create(organizer);
  }

  async update(
    championshipId: string,
    userId: string,
    organizer: Organizer,
  ): Promise<Organizer> {
    const oldOrganizer =
      await this.organizerRepository.findByChampionshipAndUser(
        championshipId,
        userId,
      );

    if (!oldOrganizer) {
      throw new NotFoundError();
    }

    if (organizer.version !== oldOrganizer.version) {
      throw new ConflictError();
    }

    const now = generateTimestamp();
    const updatedOrganizer: Organizer = {
      ...oldOrganizer,
      role: organizer.role,
      version: oldOrganizer.version + 1,
      updatedAt: now,
    };

    return this.organizerRepository.update(updatedOrganizer);
  }

  async delete(championshipId: string, userId: string): Promise<void> {
    const organizer = await this.organizerRepository.findByChampionshipAndUser(
      championshipId,
      userId,
    );

    if (!organizer) {
      throw new NotFoundError();
    }

    return this.organizerRepository.delete(championshipId, userId);
  }

  async findByChampionshipAndUser(
    championshipId: string,
    userId: string,
  ): Promise<Organizer | null> {
    return this.organizerRepository.findByChampionshipAndUser(
      championshipId,
      userId,
    );
  }

  async findByChampionshipId(championshipId: string): Promise<Organizer[]> {
    return this.organizerRepository.findByChampionshipId(championshipId);
  }

  async findByUserId(userId: string): Promise<Organizer[]> {
    return this.organizerRepository.findByUserId(userId);
  }
}
