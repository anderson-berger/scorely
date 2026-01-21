import { UnauthorizedError } from "@/utils/error/errors";
import { TokenService } from "@/utils/jwt/TokenService";
import { UserService } from "@/modules/user/UserService";

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

  async verifyAndAuthenticate(token: string): Promise<{ type: string; token: string }> {
    try {
      const payload = await this.tokenService.verifyMagicLinkToken(token);
      const email = payload.email;

      if (!email) {
        throw new UnauthorizedError("Invalid token");
      }

      const userExist = await this.userService.findByEmail(email);

      const user = userExist
        ? userExist
        : await this.userService.create({ email });

      const accessToken = await this.tokenService.generateAccessToken(user);

      return { type: "Bearer", token: accessToken };
    } catch (error: any) {
      if (error.code === "ERR_JWT_EXPIRED") {
        throw new UnauthorizedError("Token expired");
      }
      throw new UnauthorizedError("Invalid token");
    }
  }
}
