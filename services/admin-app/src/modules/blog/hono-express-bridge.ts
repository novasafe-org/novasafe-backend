import type { ServerResponse, IncomingMessage } from 'node:http';
import express, { type RequestHandler } from 'express';
import type { Hono } from 'hono';

const jsonParser = express.json({ limit: '10mb' });

function isMultipartUpload(path: string): boolean {
  return path.startsWith('/api/v1/media/upload') || path.startsWith('/api/media/upload');
}

function methodMayHaveBody(method: string | undefined): boolean {
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
}

async function readRawBody(req: IncomingMessage): Promise<Buffer> {
  if (req.readableEnded || req.readable === false) {
    return Buffer.alloc(0);
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function headersFromNode(req: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }
  return headers;
}

async function buildFetchRequest(req: IncomingMessage & { body?: unknown }): Promise<Request> {
  const host = req.headers.host ?? 'localhost';
  const url = new URL(req.url ?? '/', `http://${host}`);
  const method = req.method ?? 'GET';
  let body: string | Buffer | undefined;

  if (methodMayHaveBody(method)) {
    if (req.body !== undefined && req.body !== null && !Buffer.isBuffer(req.body)) {
      const serialized =
        typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      body = serialized;
    } else {
      const raw = await readRawBody(req);
      if (raw.length > 0) {
        body = raw;
      }
    }
  }

  return new Request(url, { method, headers: headersFromNode(req), body });
}

async function writeFetchResponse(webRes: Response, res: ServerResponse): Promise<void> {
  res.statusCode = webRes.status;
  webRes.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'transfer-encoding') return;
    res.setHeader(key, value);
  });
  const buffer = Buffer.from(await webRes.arrayBuffer());
  res.end(buffer);
}

/** Lambda + serverless-express often leaves the body on `req.body` with an empty stream; Hono needs a real body. */
export async function serveHonoOnExpress(
  hono: Hono<any>,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const fetchReq = await buildFetchRequest(req as IncomingMessage & { body?: unknown });
    const fetchRes = await hono.fetch(fetchReq);
    await writeFetchResponse(fetchRes, res);
  } catch (error) {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Blog request failed' },
        }),
      );
    }
    console.error('[blog] serveHonoOnExpress failed', error);
  }
}

export function createBlogExpressMiddleware(hono: Hono<any>): RequestHandler {
  return (req, res, next) => {
    const run = () => {
      void serveHonoOnExpress(hono, req, res);
    };

    if (isMultipartUpload(req.path)) {
      run();
      return;
    }

    if (methodMayHaveBody(req.method)) {
      jsonParser(req, res, (err) => {
        if (err) {
          next(err);
          return;
        }
        run();
      });
      return;
    }

    run();
  };
}
