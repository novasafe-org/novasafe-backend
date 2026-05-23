import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { tokenVaultService } from '../../auth/token-vault.service';
import { historyStore } from '../../history/history.store';
import { inspectResponseTrace } from '../../tracing/trace-inspector';
import { logger } from '../../utils/logger';
import { toCurl, toFetch } from '../../requests/curl-exporter';

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
]);

const PLAYGROUND_META_HEADERS = new Set([
  'x-playground-environment',
  'x-playground-client-profile',
  'x-playground-access-token',
  'x-playground-api-key',
]);

const buildForwardHeaders = async (req: Request): Promise<Headers> => {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value !== 'string') continue;
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower) || PLAYGROUND_META_HEADERS.has(lower)) continue;
    headers.set(key, value);
  }

  const ctx = req.playground;
  if (ctx?.clientHeaders) {
    for (const [key, value] of Object.entries(ctx.clientHeaders)) {
      headers.set(key, value);
    }
  }

  if (!headers.has('x-request-id')) {
    headers.set('x-request-id', uuidv4());
  }
  if (!headers.has('x-trace-id')) {
    headers.set('x-trace-id', uuidv4());
  }

  const explicitToken = req.header('x-playground-access-token');
  const vaultBearer = await tokenVaultService.getActiveBearer();
  if (!headers.has('authorization')) {
    if (explicitToken) {
      headers.set(
        'authorization',
        explicitToken.startsWith('Bearer ') ? explicitToken : `Bearer ${explicitToken}`,
      );
    } else if (vaultBearer) {
      headers.set('authorization', vaultBearer);
    }
  }

  return headers;
};

const headersToRecord = (headers: Headers): Record<string, string> => {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
};

const previewBody = (text: string, max = 2048): string =>
  text.length > max ? `${text.slice(0, max)}…` : text;

export const coreProxyHandler = async (req: Request, res: Response): Promise<void> => {
  const start = Date.now();
  const ctx = req.playground;
  if (!ctx) {
    res.status(500).json({ success: false, message: 'Playground context missing' });
    return;
  }

  const targetPath = req.path.startsWith('/') ? req.path : `/${req.path}`;
  const queryIndex = req.url.indexOf('?');
  const query = queryIndex >= 0 ? req.url.slice(queryIndex) : '';
  const targetUrl = `${ctx.coreUrl.replace(/\/$/, '')}${targetPath}${query}`;

  try {
    const headers = await buildForwardHeaders(req);
    const init: RequestInit = {
      method: req.method,
      headers,
      redirect: 'manual',
    };

    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body !== undefined) {
      const raw =
        typeof req.body === 'string'
          ? req.body
          : Buffer.isBuffer(req.body)
            ? req.body
            : JSON.stringify(req.body);
      init.body = raw as BodyInit;
      if (!headers.has('content-type') && typeof req.body === 'object') {
        headers.set('content-type', 'application/json');
      }
    }

    const upstream = await fetch(targetUrl, init);
    const durationMs = Date.now() - start;
    const responseText = await upstream.text();
    const trace = inspectResponseTrace(upstream.headers, upstream.status, durationMs);

    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (!HOP_BY_HOP.has(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });
    res.setHeader('x-playground-proxy-duration-ms', String(durationMs));
    res.setHeader('x-playground-environment', ctx.environmentId);
    res.setHeader('x-playground-client-profile', ctx.clientProfileId);
    res.send(responseText);

    const reqHeaders = headersToRecord(headers);
    void historyStore
      .add({
        method: req.method,
        url: targetUrl,
        environmentId: ctx.environmentId,
        clientProfileId: ctx.clientProfileId,
        statusCode: upstream.status,
        durationMs,
        trace,
        requestHeaders: reqHeaders,
        responseHeaders: headersToRecord(upstream.headers),
        requestBodyPreview: previewBody(
          typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? ''),
        ),
        responseBodyPreview: previewBody(responseText),
      })
      .catch((err) => logger.warn('History persist failed', { error: String(err) }));
  } catch (error) {
    logger.error('Proxy error', { targetUrl, error: String(error) });
    res.status(502).json({
      success: false,
      code: 'PROXY_ERROR',
      message: 'Failed to reach core API',
      targetUrl,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export const exportCurlFromHistory = (entry: {
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBodyPreview?: string;
}): { curl: string; fetch: string } => ({
  curl: toCurl({
    method: entry.method,
    url: entry.url,
    headers: entry.requestHeaders,
    body: entry.requestBodyPreview,
  }),
  fetch: toFetch({
    method: entry.method,
    url: entry.url,
    headers: entry.requestHeaders,
    body: entry.requestBodyPreview,
  }),
});
