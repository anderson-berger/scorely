import { SignJWT, jwtVerify } from "jose";
import { UnauthorizedError } from "@/utils/error/errors";
import { env } from "@/utils/config/env";
import { AccessTokenSubject } from "@/utils/token/token_schemas";

const MAGIC_LINK_TOKEN_EXPIRY = "15m";
const ACCESS_TOKEN_EXPIRY = "7d";

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
      .setExpirationTime(MAGIC_LINK_TOKEN_EXPIRY)
      .sign(this.magicLinkSecret);
  }

  async generateAccessToken(
    accessTokenSubject: AccessTokenSubject,
  ): Promise<string> {
    return await new SignJWT(accessTokenSubject)
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt()
      .setExpirationTime(ACCESS_TOKEN_EXPIRY)
      .sign(this.accessSecret);
  }

  async verifyMagicLinkToken(token: string): Promise<string> {
    try {
      const { payload } = await jwtVerify(token, this.magicLinkSecret);
      return payload.email as string;
    } catch (error) {
      throw new UnauthorizedError("Invalid or expired token");
    }
  }

  async verifyAccessToken(token: string): Promise<AccessTokenSubject> {
    try {
      const { payload } = await jwtVerify<AccessTokenSubject>(
        token,
        this.accessSecret,
      );
      return payload;
    } catch (error) {
      throw new UnauthorizedError("Invalid or expired token");
    }
  }
}
