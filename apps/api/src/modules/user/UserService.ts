import { generateId, generateTimestamp } from "@/utils/generators";
import { UserRepository } from "@/modules/user/UserRepository";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "@/utils/error/errors";
import {
  $attributesUser,
  $lookupUser,
  type AuthProvider,
  type LookupType,
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

  private async createByMagicLink(newUser: NewUser): Promise<User> {
    if (!newUser.email) {
      throw new BadRequestError("Email is required for magic_link provider");
    }

    await this.userRepository.validateLookups(newUser);

    const now = generateTimestamp();
    const user: User = {
      id: generateId(),
      version: 1,
      createdAt: now,
      updatedAt: now,
      ...newUser,
    };

    return this.userRepository.createWithLookups(user);
  }

  async update(userId: string, requestedBy: string, input: User): Promise<User> {
    if (userId !== requestedBy) {
      throw new ForbiddenError("You can only update your own account");
    }

    const currentUser = await this.userRepository.findById(userId);
    if (!currentUser) {
      throw new NotFoundError("User not found");
    }

    if (input.version !== currentUser.version) {
      throw new BadRequestError("Version mismatch");
    }

    const attributes = $attributesUser.parse(input);
    const lookups = $lookupUser.parse(input);

    await this.userRepository.validateLookups(lookups, userId);

    const now = generateTimestamp();
    const updatedUser: User = {
      ...currentUser,
      ...lookups,
      ...attributes,
      version: currentUser.version + 1,
      updatedAt: now,
    };

    return this.userRepository.updateWithLookups(updatedUser, currentUser);
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findById(id);
  }

  async findByLookup(type: LookupType, value: string): Promise<User | null> {
    return this.userRepository.findByLookup(type, value);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.findByLookup("email", email);
  }

  async findByNickname(nickname: string): Promise<User | null> {
    return this.findByLookup("nickname", nickname);
  }

  async list(pagination: PaginationQuery): Promise<PaginatedResult<User>> {
    return this.userRepository.list(pagination);
  }

  async delete(userId: string, requestedBy: string): Promise<void> {
    if (userId !== requestedBy) {
      throw new ForbiddenError("You can only delete your own account");
    }

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError("User not found");
    }

    return this.userRepository.deleteWithLookups(user);
  }
}
