import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getConfig } from "@/types/config";
import type { RequestContext } from "@/types/auth";
import { HTTP } from "@/lib/constants";
import { handleError, sendError, sendJson, setCors } from "@/lib/response";
import { verifyAdmin } from "@/lib/auth";
import { requireMongo } from "@/middleware/requireMongo";
import type { MongoRepositories } from "@/repositories/types";

export type HandlerContext = RequestContext & {
  repos?: MongoRepositories;
};

type HandlerFn = (
  req: VercelRequest,
  res: VercelResponse,
  ctx: HandlerContext,
) => Promise<void> | void;

export type CreateHandlerOptions = {
  methods?: string[];
  auth?: boolean;
  mongo?: boolean;
};

export function createHandler(fn: HandlerFn, options: CreateHandlerOptions = {}) {
  const { methods, auth = false, mongo = false } = options;

  return async (req: VercelRequest, res: VercelResponse): Promise<void> => {
    const config = getConfig();
    const isAllowed = setCors(req, res, config);

    if (req.method === "OPTIONS") {
      if (!isAllowed && req.headers.origin) {
        res.status(HTTP.FORBIDDEN).end();
        return;
      }
      res.status(HTTP.NO_CONTENT).end();
      return;
    }

    if (methods && req.method && !methods.includes(req.method)) {
      sendError(res, HTTP.BAD_REQUEST, "METHOD_NOT_ALLOWED", `Method ${req.method} not allowed`);
      return;
    }

    const ctx: HandlerContext = { config };

    try {
      if (auth) {
        ctx.admin = await verifyAdmin(req, config);
      }

      if (mongo) {
        ctx.repos = await requireMongo();
      }

      await fn(req, res, ctx);
    } catch (error) {
      handleError(res, error);
    }
  };
}
