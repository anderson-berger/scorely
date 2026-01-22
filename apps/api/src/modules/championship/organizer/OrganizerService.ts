import { generateId, generateTimestamp } from "@/utils/generators";
import { OrganizerRepository } from "./OrganizerRepository";
import type { Organizer, NewOrganizer } from "./organizer_schemas";

export class OrganizerService {
  private organizerRepository = new OrganizerRepository();

  async create(newOrganizer: NewOrganizer): Promise<Organizer> {
    const now = generateTimestamp();
    const organizer: Organizer = {
      id: generateId(),
      createdAt: now,
      updatedAt: now,
      ...newOrganizer,
    };
    return this.organizerRepository.create(organizer);
  }
}
