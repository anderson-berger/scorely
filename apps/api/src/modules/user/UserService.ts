import { UserRepository } from "@/modules/user/UserRepository";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "@/utils/error/errors";
import {
  $attributesUser,
  type AuthProvider,
  type NewUser,
  type User,
} from "@/modules/user/user.schemas";
import type {
  PaginatedResult,
  PaginationQuery,
} from "@/utils/pagination/pagination";

export class UserService {
  private userRepository = new UserRepository();

  async create(newUser: NewUser, provider: AuthProvider): Promise<User> {
    switch (provider) {
      case "magic_link":
        return this.createByMagicLink(newUser);
      default:
        throw new BadRequestError(`Provider '${provider}' not supported`);
    }
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

  async update(requestedBy: User["id"], input: User): Promise<User> {
    if (requestedBy !== input.id) {
      throw new ForbiddenError("You can only update your own account");
    }

    const currentUser = await this.userRepository.findById(input.id);

    if (!currentUser) {
      throw new NotFoundError("User not found");
    }

    if (input.version !== currentUser.version) {
      throw new BadRequestError("Version mismatch");
    }

    if (currentUser.email !== input.email) {
      throw new BadRequestError("Email cannot be updated");
    }

    const attributes = $attributesUser.parse(input);
    console.log("attributes", attributes);
    return this.userRepository.update(currentUser, attributes);
  }

  async delete(userId: string, requestedBy: string): Promise<void> {
    if (userId !== requestedBy) {
      throw new ForbiddenError("You can only delete your own account");
    }

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError("User not found");
    }

    await this.userRepository.delete(user.id);
  }

  private async createByMagicLink(newUser: NewUser): Promise<User> {
    if (!newUser.email) {
      throw new BadRequestError("Email is required for magic_link provider");
    }

    const existingUser = await this.userRepository.findByEmail(newUser.email);

    if (existingUser) {
      throw new BadRequestError("Email already in use");
    }

    return this.userRepository.create({ email: newUser.email });
  }
}
