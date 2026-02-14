import { UserRepository } from "@/modules/user/repositories/user_repository";
import { UserLookupsRepository } from "@/modules/user/repositories/user_lookups_repository";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "@/utils/error/errors";
import type { User } from "@/modules/user/user_types";
import { generateId, generateTimestamp } from "@/utils/generators";
import {
  PaginatedResult,
  PaginationQuery,
} from "@/utils/pagination/pagination";

export class UserService {
  private userRepository = new UserRepository();
  private userLookupsRepository = new UserLookupsRepository();

  async createUserByMagicLink(
    email: NonNullable<User["email"]>,
  ): Promise<User> {
    const userId =
      await this.userLookupsRepository.getUserIdByEmailLookup(email);

    if (userId) {
      throw new BadRequestError("Email already in use");
    }

    const user = this.buildNewUserMagicLink(email);

    const createdUser = await this.userRepository.create(user);

    await this.userLookupsRepository.createEmailLookup(createdUser.id, email);

    return createdUser;
  }

  async findById(userId: User["id"]): Promise<User | null> {
    const user = await this.userRepository.getById(userId);
    return user;
  }

  async getUserByEmail(
    email: NonNullable<User["email"]>,
  ): Promise<User | null> {
    const userId =
      await this.userLookupsRepository.getUserIdByEmailLookup(email);

    if (!userId) return null;

    const user = await this.userRepository.getById(userId);
    return user;
  }

  async update(requestedBy: User["id"], input: User): Promise<User> {
    if (requestedBy !== input.id) {
      throw new ForbiddenError("You can only update your own account");
    }
    const currentUser = await this.userRepository.getById(input.id);

    if (!currentUser) {
      throw new NotFoundError("User not found");
    }

    if (input.version !== currentUser.version) {
      throw new BadRequestError("Version mismatch");
    }

    const user = this.buildUpdateUser(input, currentUser);

    await this.userRepository.update(user);

    return user;
  }

  async list(pagination: PaginationQuery): Promise<PaginatedResult<User>> {
    return this.userRepository.list(pagination);
  }

  private buildNewUserMagicLink(email: NonNullable<User["email"]>): User {
    //TODO: Talvez para frente um get por id teria valor apenas para ter certeza que o id nao esta em uso.
    const now = generateTimestamp();
    const id = generateId();
    const version = 1;
    const createdAt = now;
    const updatedAt = now;

    const user: User = {
      id,
      version,
      createdAt,
      updatedAt,
      email,
    };
    return user;
  }

  private buildUpdateUser(input: User, currentUser: User): User {
    const now = generateTimestamp();

    return {
      ...currentUser,
      ...input,
      id: currentUser.id,
      version: currentUser.version + 1,
      createdAt: currentUser.createdAt,
      updatedAt: now,
    };
  }
}
