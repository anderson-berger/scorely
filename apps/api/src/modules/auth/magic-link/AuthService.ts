import { TokenService } from "@/utils/token/TokenService";
import { UserService } from "@/modules/user/user/UserService";
import { env } from "@/utils/config/env";
import type { AuthToken } from "@scorely/shared/schemas/auth";

export class AuthService {
  private tokenService = new TokenService();
  private userService = new UserService();

  async sendMagicLink(email: string): Promise<{ magicLink: string }> {
    const token = await this.tokenService.generateMagicLinkToken(email);
    const magicLink = `${env.FRONTEND_URL}/auth/verify?token=${token}`;

    console.log("=================================");
    console.log("MAGIC LINK para:", email);
    console.log(magicLink);
    console.log("=================================");

    return { magicLink };
  }

  async verifyAndAuthenticate(token: string): Promise<AuthToken> {
    const email = await this.tokenService.verifyMagicLinkToken(token);
    const existingUser = await this.userService.findByEmail(email);
    const user = existingUser ?? (await this.userService.create(email));
    const accessToken = await this.tokenService.generateAccessToken({
      userId: user.id,
    });

    return { type: "Bearer", token: accessToken };
  }
}
