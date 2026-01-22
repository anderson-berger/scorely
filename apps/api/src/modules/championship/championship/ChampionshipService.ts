import { generateId, generateTimestamp } from "@/utils/generators";
import { ChampionshipRepository } from "./ChampionshipRepository";
import type { Championship, NewChampionship } from "./championship_schemas";
import type {
  PaginatedResult,
  PaginationQuery,
} from "@/utils/pagination/pagination";

export class ChampionshipService {
  private championshipRepository = new ChampionshipRepository();

  async create(newChampionship: NewChampionship): Promise<Championship> {
    const now = generateTimestamp();
    const championship: Championship = {
      id: generateId(),
      createdAt: now,
      updatedAt: now,
      ...newChampionship,
    };
    return this.championshipRepository.create(championship);
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
