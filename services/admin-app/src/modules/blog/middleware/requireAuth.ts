import type { VercelRequest } from "@vercel/node";
import type { AdminContext, RequestContext } from "@/types/auth";
import { UnauthorizedError } from "@/lib/errors";
import { verifyAdmin } from "@/lib/auth";

export async function requireAuth(
  req: VercelRequest,
  ctx: RequestContext,
): Promise<AdminContext> {
  try {
    return await verifyAdmin(req, ctx.config);
  } catch (error) {
    if (error instanceof UnauthorizedError) throw error;
    throw new UnauthorizedError();
  }
}
