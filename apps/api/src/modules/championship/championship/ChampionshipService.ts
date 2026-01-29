import { generateId, generateTimestamp } from "@/utils/generators";
import { ConflictError, NotFoundError } from "@/utils/error/errors";
import { ChampionshipRepository } from "./ChampionshipRepository";
import {
  type Championship,
  type NewChampionship,
  $updateChampionship,
} from "@scorely/shared/schemas/championship/championship_schemas";
import type { NewOrganizer } from "@scorely/shared/schemas/championship/organizer_schemas";
import type { User } from "@scorely/shared/schemas/user/user_schemas";
import type {
  PaginatedResult,
  PaginationQuery,
} from "@/utils/pagination/pagination";
import { OrganizerService } from "@/modules/championship/organizer/OrganizerService";

export class ChampionshipService {
  private championshipRepository = new ChampionshipRepository();
  private organizerService = new OrganizerService();

  async create(
    userId: User["id"],
    newChampionship: NewChampionship,
  ): Promise<Championship> {
    const now = generateTimestamp();
    const championship: Championship = {
      id: generateId(),
      version: 0,
      createdAt: now,
      updatedAt: now,
      ...newChampionship,
    };

    await this.championshipRepository.create(championship);

    const newOrganizer: NewOrganizer = {
      userId,
      championshipId: championship.id,
      role: "owner",
    };
    await this.organizerService.create(newOrganizer);

    return championship;
  }

  async update(
    championshipId: Championship["id"],
    championship: Championship,
  ): Promise<Championship> {
    const oldChampionship =
      await this.championshipRepository.findById(championshipId);

    if (!oldChampionship) {
      throw new NotFoundError();
    }

    if (championship.version !== oldChampionship.version) {
      throw new ConflictError();
    }

    const now = generateTimestamp();
    const updateChampionship = $updateChampionship.parse(championship);
    const updatedChampionship: Championship = {
      ...oldChampionship,
      ...updateChampionship,
      version: oldChampionship.version + 1,
      updatedAt: now,
    };

    return this.championshipRepository.update(updatedChampionship);
  }

  async findById(id: string): Promise<Championship | null> {
    return this.championshipRepository.findById(id);
  }

  async list(
    pagination: PaginationQuery,
  ): Promise<PaginatedResult<Championship>> {
    return this.championshipRepository.list(pagination);
  }
}
