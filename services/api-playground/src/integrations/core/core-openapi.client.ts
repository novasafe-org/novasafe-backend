import { environmentRegistry } from '../../environments/environment.registry';
import { logger } from '../../utils/logger';

export const fetchCoreOpenApi = async (environmentId?: string): Promise<Record<string, unknown>> => {
  const url = environmentRegistry.resolveOpenapiUrl(environmentId);
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
  });

  if (!response.ok) {
    const body = await response.text();
    logger.error('Failed to fetch core OpenAPI', { url, status: response.status, body: body.slice(0, 500) });
    throw new Error(`Core OpenAPI fetch failed (${response.status}) from ${url}`);
  }

  return (await response.json()) as Record<string, unknown>;
};
