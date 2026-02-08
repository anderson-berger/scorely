import { BaseRepository } from "@/infra/db/BaseRepository";
import { env } from "@/utils/config/env";
import type { User, NewUser } from "@/modules/user/user.schemas";

export class UserRepository extends BaseRepository<User, NewUser> {
  constructor() {
    super({
      tableName: env.TABLE,
      entityName: "user",
      lookupFields: ["email"] as (keyof User)[],
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.findByLookup("email" as keyof User, email);
  }
}
