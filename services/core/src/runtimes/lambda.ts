/**
 * AWS Lambda entrypoint only — not used by Docker, VPS, or `node dist/index.js`.
 * Handler: dist/runtimes/lambda.handler (built via `pnpm run build:lambda`).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

try {
  const meta = JSON.parse(readFileSync(join(__dirname, '../version.json'), 'utf8')) as {
    version?: string;
    build?: string;
  };
  console.log(`[mobile-api] package version=${meta.version ?? '?'} build=${meta.build ?? '?'}`);
} catch {
  console.log('[mobile-api] package loaded (no version.json)');
}

import '../loadEnv';

import serverlessExpress from '@codegenie/serverless-express';

import app, { initializeApp } from '../app';

type ServerlessHandler = (event: unknown, context: unknown) => Promise<unknown>;

type ApiGatewayHttpEvent = {
  rawPath?: string;
  path?: string;
  requestContext?: { http?: { method?: string; path?: string } };
};

const isHealthProbe = (event: unknown): boolean => {
  if (!event || typeof event !== 'object') return false;
  const record = event as ApiGatewayHttpEvent;
  const method = record.requestContext?.http?.method?.toUpperCase() ?? 'GET';
  if (method !== 'GET') return false;
  const path = record.rawPath || record.requestContext?.http?.path || record.path || '';
  return path === '/health' || path === '/api/v1/health' || path === '/mobile/health' || path.endsWith('/health');
};

let cachedHandler: ServerlessHandler | undefined;
let initialization: Promise<void> | undefined;

const bootstrap = async (): Promise<ServerlessHandler> => {
  if (!initialization) {
    console.log('[mobile-api] cold start: initializing app');
    initialization = initializeApp().catch((error: unknown) => {
      initialization = undefined;
      const message = error instanceof Error ? error.message : String(error);
      console.error('[mobile-api] initializeApp failed:', message);
      throw error;
    });
  }
  await initialization;

  if (!cachedHandler) {
    cachedHandler = serverlessExpress({ app }) as unknown as ServerlessHandler;
  }

  return cachedHandler;
};

export const handler = async (event: unknown, context: unknown) => {
  if (isHealthProbe(event)) {
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        success: true,
        service: 'core',
        status: 'ok',
        probe: 'lambda',
      }),
    };
  }

  const lambdaHandler = await bootstrap();
  return lambdaHandler(event, context);
};
