import type { AppConfig } from "@/types/config";
import type { AdminRole } from "@/types/auth";
import type { LoginBody } from "@/schemas/auth.schema";
import { ForbiddenError, NotImplementedError, UnauthorizedError } from "@/lib/errors";
import { signAccessToken } from "@/lib/jwt";
import { newId } from "@/lib/utils";

export type LoginResponse = {
  accessToken: string;
  user: {
    id: string;
    email: string;
    displayName: string | null;
    role: AdminRole;
  };
};

export class AuthService {
  constructor(private readonly config: AppConfig) {}

  async login(input: LoginBody): Promise<LoginResponse> {
    const { ADMIN_EMAIL, ADMIN_PASSWORD } = this.config;

    if (ADMIN_EMAIL && ADMIN_PASSWORD) {
      if (input.email !== ADMIN_EMAIL || input.password !== ADMIN_PASSWORD) {
        throw new UnauthorizedError("Invalid email or password");
      }

      return this.issueAccessToken({
        id: newId(),
        email: ADMIN_EMAIL,
        role: "super_admin",
      });
    }

    throw new NotImplementedError("AuthService.login");
  }

  async issueAccessToken(admin: {
    id: string;
    email: string;
    role: AdminRole;
  }): Promise<LoginResponse> {
    const { token } = await signAccessToken(this.config, {
      sub: admin.id,
      email: admin.email,
      role: admin.role,
    });

    return {
      accessToken: token,
      user: {
        id: admin.id,
        email: admin.email,
        displayName: null,
        role: admin.role,
      },
    };
  }

  assertAdminConfigured(): void {
    if (!this.config.ADMIN_EMAIL || !this.config.ADMIN_PASSWORD) {
      throw new ForbiddenError("Admin login is not configured");
    }
  }
}

export function createAuthService(config: AppConfig): AuthService {
  return new AuthService(config);
}
