import type { VercelRequest } from "@vercel/node";
import type { AppConfig } from "@/types/config";
import type { AdminContext } from "@/types/auth";
import { UnauthorizedError } from "@/lib/errors";
import { extractBearerToken as extractLegacyBearerToken, verifyAccessToken } from "@/lib/jwt";
import {
  extractBearerToken,
  principalHasPermission,
  resolvePrincipalFromBearer,
} from "../../../shared/resolve-principal";
import { API_TOKEN_PREFIX } from "../../service-accounts/service-accounts.service";

export { extractBearerToken } from "@/lib/jwt";

function principalToAdminContext(
  principal: Awaited<ReturnType<typeof resolvePrincipalFromBearer>>,
): AdminContext {
  if (principal.kind === "service_account") {
    const author = principal.defaultAuthor;
    return {
      id: author?.id ?? principal.id,
      email: author?.email ?? principal.email,
      name: author?.name ?? principal.name,
      role: "editor",
    };
  }
  return {
    id: principal.id,
    email: principal.email,
    name: principal.name,
    role: principal.roleKey === "owner" ? "super_admin" : "editor",
  };
}

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
  _config: AppConfig,
): Promise<AdminContext> {
  const token = extractBearerToken(authHeader);
  if (!token) {
    throw new UnauthorizedError("Missing or invalid Authorization header");
  }

  if (token.startsWith(API_TOKEN_PREFIX)) {
    const principal = await resolvePrincipalFromBearer(token);
    const allowed = await principalHasPermission(principal, "content.manage", "manage");
    if (!allowed) {
      throw new UnauthorizedError("API token lacks content.manage permission");
    }
    return principalToAdminContext(principal);
  }

  const legacy = await verifyAccessToken(_config, token);
  if (legacy.valid) {
    return {
      id: legacy.claims.sub,
      email: legacy.claims.email,
      name: legacy.claims.email,
      role: legacy.claims.role,
    };
  }

  try {
    const principal = await resolvePrincipalFromBearer(token);
    return principalToAdminContext(principal);
  } catch {
    const message =
      legacy.valid === false && legacy.reason === "expired"
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

  if (token.startsWith(API_TOKEN_PREFIX)) {
    try {
      const principal = await resolvePrincipalFromBearer(token);
      return (
        (await principalHasPermission(principal, "content.read", "read")) ||
        (await principalHasPermission(principal, "content.manage", "read"))
      );
    } catch {
      return false;
    }
  }

  const result = await verifyAccessToken(config, token);
  if (result.valid) return true;
  try {
    await resolvePrincipalFromBearer(token);
    return true;
  } catch {
    return false;
  }
}
