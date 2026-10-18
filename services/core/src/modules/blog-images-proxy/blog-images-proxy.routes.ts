import { Router, type Request, type Response } from "express";

import { logger } from "../../shared/logger";

const PROXY_TIMEOUT_MS = 15_000;

const adminApiBase = (): string =>
  (process.env.ADMIN_API_URL || "http://localhost:3130").replace(/\/$/, "");

function sendUnavailable(res: Response, reason: string): void {
  res.status(503).json({
    success: false,
    message: "Blog image service temporarily unavailable",
    hint: "Ensure novasafe-admin-api is running with MEDIA_PROVIDER=google_drive",
    reason,
  });
}

export function createBlogImagesProxyRoutes(): Router {
  const router = Router();

  router.get("/:fileId", async (req, res) => {
    const fileId = encodeURIComponent(req.params.fileId);
    const url = `${adminApiBase()}/api/v1/blog-images/${fileId}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

    try {
      const response = await fetch(url, { signal: controller.signal });
      res.status(response.status);

      const contentType = response.headers.get("content-type");
      if (contentType) res.setHeader("Content-Type", contentType);

      const cacheControl = response.headers.get("cache-control");
      if (cacheControl) res.setHeader("Cache-Control", cacheControl);

      const nosniff = response.headers.get("x-content-type-options");
      if (nosniff) res.setHeader("X-Content-Type-Options", nosniff);

      const corp = response.headers.get("cross-origin-resource-policy");
      if (corp) res.setHeader("Cross-Origin-Resource-Policy", corp);

      if (!response.ok) {
        const text = await response.text();
        try {
          res.json(JSON.parse(text));
        } catch {
          res.send(text);
        }
        return;
      }

      res.send(Buffer.from(await response.arrayBuffer()));
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      logger.warn("Blog image proxy failed", { url, reason });
      sendUnavailable(res, reason);
    } finally {
      clearTimeout(timer);
    }
  });

  return router;
}
