import { TokenService } from "@/shared/token/token_service";
import { UserService } from "@/modules/user/user_service";
import { UserLookupsRepository } from "@/modules/user/repositories/user_lookups_repository";
import { env } from "@/utils/config/env";
import type { AuthToken } from "@/modules/auth/auth_schemas";

const tokenService = new TokenService();
const userService = new UserService();

export async function sendMagicLink(
  email: string,
): Promise<{ magicLink: string }> {
  const token = await tokenService.generateMagicLinkToken(email);
  const magicLink = `${env.FRONTEND_URL}/auth/verify?token=${token}`;

  console.log("=================================");
  console.log("MAGIC LINK para:", email);
  console.log(magicLink);
  console.log("=================================");

  return { magicLink };
}

export async function verifyAndAuthenticate(token: string): Promise<AuthToken> {
  const email = await tokenService.verifyMagicLinkToken(token);
  const user = await userService.getUserByEmail(email);

  const userId = user
    ? user.id
    : (await userService.createUserByMagicLink(email)).id;

  const accessToken = await tokenService.generateAccessToken(userId);
  console.log("acesstoken", accessToken);
  return { type: "Bearer", token: accessToken };
}
