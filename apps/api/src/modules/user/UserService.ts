import { UserRepository } from "./UserRepository";
import type { User, NewUser, UpdateUser } from "./user_schemas";
import type { PaginatedResult, PaginationQuery } from "@/utils/pagination/pagination";

export class UserService {
  private userRepository = new UserRepository();

  async create(data: NewUser): Promise<User> {
    return this.userRepository.create(data);
  }

  async update(id: string, data: UpdateUser): Promise<User | null> {
    return this.userRepository.update(id, data);
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findById(id);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findByEmail(email);
  }

  async list(pagination: PaginationQuery): Promise<PaginatedResult<User>> {
    return this.userRepository.list(pagination);
  }
}
