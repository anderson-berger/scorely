import { TokenService } from "@/utils/token/TokenService";
import { UserService } from "@/modules/user/UserService";
import type { AuthToken } from "@/modules/auth/magic-link/auth_schemas";

export class AuthService {
  private tokenService = new TokenService();
  private userService = new UserService();

  async sendMagicLink(email: string): Promise<{ magicLink: string }> {
    const token = await this.tokenService.generateMagicLinkToken(email);
    const magicLink = `http://localhost:5173/auth/verify?token=${token}`;

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
