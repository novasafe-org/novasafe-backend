import { SignJWT, jwtVerify } from "jose";
import type { AppConfig } from "@/types/config";
import type { JwtAccessClaims, TokenVerifyResult } from "@/types/auth";

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signAccessToken(
  config: AppConfig,
  claims: Omit<JwtAccessClaims, "type">,
): Promise<{ token: string; expiresIn: number }> {
  const expiresIn = Number.parseInt(config.JWT_ACCESS_TTL_SECONDS, 10) || 3600;
  const now = Math.floor(Date.now() / 1000);

  const token = await new SignJWT({
    email: claims.email,
    role: claims.role,
    type: "access",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuer(config.JWT_ISSUER)
    .setAudience(config.JWT_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + expiresIn)
    .sign(secretKey(config.JWT_SECRET));

  return { token, expiresIn };
}

export async function verifyAccessToken(
  config: AppConfig,
  token: string,
): Promise<TokenVerifyResult> {
  try {
    const { payload } = await jwtVerify(token, secretKey(config.JWT_SECRET), {
      issuer: config.JWT_ISSUER,
      audience: config.JWT_AUDIENCE,
    });

    if (payload.type !== "access" || typeof payload.sub !== "string") {
      return { valid: false, reason: "invalid" };
    }

    const email = typeof payload.email === "string" ? payload.email : "";
    const role = payload.role;
    if (role !== "super_admin" && role !== "admin" && role !== "editor") {
      return { valid: false, reason: "invalid" };
    }

    return {
      valid: true,
      claims: {
        sub: payload.sub,
        email,
        role,
        type: "access",
      },
    };
  } catch (error) {
    if (error instanceof Error && error.name === "JWTExpired") {
      return { valid: false, reason: "expired" };
    }
    return { valid: false, reason: "malformed" };
  }
}

export function extractBearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const [scheme, token] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim() || null;
}
