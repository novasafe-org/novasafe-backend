import { getRequestListener } from "@hono/node-server";
import { app } from "@/app";

/**
 * Vercel invokes api/*.js with Node.js (req, res).
 * hono/vercel's handle() returns a Fetch handler — incompatible with bundled .js.
 * getRequestListener bridges IncomingMessage → Hono → ServerResponse.
 */
export default getRequestListener(app.fetch);
