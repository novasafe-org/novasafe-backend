/**
 * AWS Lambda entrypoint only — not used by Docker, VPS, or `node dist/index.js`.
 * Handler: dist/runtimes/lambda.handler (built via `pnpm run build:lambda`).
 */
import '../loadEnv';

import serverlessExpress from '@codegenie/serverless-express';

import app, { initializeApp } from '../app';

type ServerlessHandler = (event: unknown, context: unknown) => Promise<unknown>;

let cachedHandler: ServerlessHandler | undefined;
let initialization: Promise<void> | undefined;

const bootstrap = async (): Promise<ServerlessHandler> => {
  if (!initialization) {
    initialization = initializeApp();
  }
  await initialization;

  if (!cachedHandler) {
    cachedHandler = serverlessExpress({ app }) as unknown as ServerlessHandler;
  }

  return cachedHandler;
};

export const handler = async (event: unknown, context: unknown) => {
  const lambdaHandler = await bootstrap();
  return lambdaHandler(event, context);
};
