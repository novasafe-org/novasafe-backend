import type { AppConfig } from "./config";

export type AdminRole = "super_admin" | "admin" | "editor";

export type AdminContext = {
  id: string;
  email: string;
  role: AdminRole;
};

export type JwtAccessClaims = {
  sub: string;
  email: string;
  role: AdminRole;
  type: "access";
};

export type TokenVerifyResult =
  | { valid: true; claims: JwtAccessClaims }
  | { valid: false; reason: "expired" | "malformed" | "invalid" };

export type LoginResult = {
  accessToken: string;
  expiresIn: number;
  tokenType: "Bearer";
  admin: {
    id: string;
    email: string;
    displayName: string | null;
    role: AdminRole;
  };
};

export type RequestContext = {
  config: AppConfig;
  admin?: AdminContext;
};
