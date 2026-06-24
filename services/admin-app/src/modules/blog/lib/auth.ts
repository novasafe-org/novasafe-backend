import type { VercelRequest } from "@vercel/node";
import type { AppConfig } from "@/types/config";
import type { AdminContext } from "@/types/auth";
import { UnauthorizedError } from "@/lib/errors";
import { extractBearerToken, verifyAccessToken } from "@/lib/jwt";

export { extractBearerToken };

export async function verifyAdmin(
  req: VercelRequest,
  config: AppConfig,
): Promise<AdminContext> {
  const authHeader = req.headers.authorization;
  return verifyAdminFromHeader(
    typeof authHeader === "string" ? authHeader : authHeader?.[0],
    config,
  );
}

export async function verifyAdminFromHeader(
  authHeader: string | undefined,
  config: AppConfig,
): Promise<AdminContext> {
  const token = extractBearerToken(authHeader);

  if (!token) {
    throw new UnauthorizedError("Missing or invalid Authorization header");
  }

  const result = await verifyAccessToken(config, token);
  if (result.valid) {
    return {
      id: result.claims.sub,
      email: result.claims.email,
      name: result.claims.email,
      role: result.claims.role,
    };
  }

  // Accept admin-app RBAC JWT (unified admin panel auth)
  try {
    const { verifyAdminToken } = await import("../../rbac/rbac.service");
    const payload = await verifyAdminToken(token);
    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name?.trim() || payload.email,
      role: payload.roleKey === "owner" ? "super_admin" : "editor",
    };
  } catch {
    const message =
      result.valid === false && result.reason === "expired"
        ? "Access token expired"
        : "Invalid access token";
    throw new UnauthorizedError(message);
  }
}

export async function isAdminRequest(
  req: VercelRequest,
  config: AppConfig,
): Promise<boolean> {
  const authHeader = req.headers.authorization;
  return isAdminFromHeader(
    typeof authHeader === "string" ? authHeader : authHeader?.[0],
    config,
  );
}

export async function isAdminFromHeader(
  authHeader: string | undefined,
  config: AppConfig,
): Promise<boolean> {
  const token = extractBearerToken(authHeader);
  if (!token) return false;
  const result = await verifyAccessToken(config, token);
  if (result.valid) return true;
  try {
    const { verifyAdminToken } = await import("../../rbac/rbac.service");
    await verifyAdminToken(token);
    return true;
  } catch {
    return false;
  }
}
