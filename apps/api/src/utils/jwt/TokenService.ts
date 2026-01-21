import { SignJWT, jwtVerify } from "jose";
import { UnauthorizedError } from "@/utils/error/errors";
import { env } from "@/utils/config/env";
import type { User } from "@/modules/user/user_schemas";
import type { MagicLinkPayload, AccessTokenPayload } from "./token_schemas";

export class TokenService {
  private readonly magicLinkSecret: Uint8Array;
  private readonly accessSecret: Uint8Array;

  constructor() {
    this.magicLinkSecret = new TextEncoder().encode(env.JWT_MAGIC_LINK_SECRET);
    this.accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
  }

  async generateMagicLinkToken(email: string): Promise<string> {
    return await new SignJWT({ email })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt()
      .setExpirationTime(env.JWT_MAGIC_LINK_TOKEN_EXPIRY)
      .sign(this.magicLinkSecret);
  }

  async generateAccessToken(user: User): Promise<string> {
    return await new SignJWT({ userId: user.id, email: user.email })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt()
      .setExpirationTime(env.JWT_ACCESS_TOKEN_EXPIRY)
      .sign(this.accessSecret);
  }

  async verifyMagicLinkToken(token: string): Promise<MagicLinkPayload> {
    try {
      const { payload } = await jwtVerify(token, this.magicLinkSecret);
      return {
        email: payload.email as string,
      };
    } catch (error) {
      throw new UnauthorizedError("Invalid or expired token");
    }
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    try {
      const { payload } = await jwtVerify(token, this.accessSecret);
      return {
        userId: payload.userId as string,
        email: payload.email as string,
      };
    } catch (error) {
      throw new UnauthorizedError("Invalid or expired token");
    }
  }
}
