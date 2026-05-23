import path from 'path';

export interface PlaygroundEnvironment {
  id: string;
  name: string;
  coreUrl: string;
  openapiUrl?: string;
}

export interface PlaygroundConfig {
  nodeEnv: string;
  port: number;
  bindHost: string;
  enabled: boolean;
  requireApiKey: boolean;
  apiKey: string;
  defaultCoreUrl: string;
  defaultOpenapiUrl: string;
  environments: PlaygroundEnvironment[];
  logLevel: string;
  dataDir: string;
  publicBaseUrl: string;
}

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

const parseEnvironments = (): PlaygroundEnvironment[] => {
  const raw = process.env.PLAYGROUND_ENVIRONMENTS;
  if (!raw) {
    return [
      { id: 'local', name: 'Local', coreUrl: 'http://127.0.0.1:3125' },
      { id: 'development', name: 'Development', coreUrl: 'http://127.0.0.1:3125' },
      { id: 'staging', name: 'Staging', coreUrl: 'http://127.0.0.1:3125' },
      { id: 'production', name: 'Production', coreUrl: 'http://127.0.0.1:3125' },
    ];
  }
  try {
    const parsed = JSON.parse(raw) as PlaygroundEnvironment[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [{ id: 'local', name: 'Local', coreUrl: process.env.CORE_API_URL || 'http://127.0.0.1:3125' }];
  }
};

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const port = Number(process.env.PLAYGROUND_PORT || 5200);

export const playgroundConfig: PlaygroundConfig = {
  nodeEnv,
  port,
  bindHost: process.env.BIND_HOST || '0.0.0.0',
  enabled: parseBoolean(process.env.PLAYGROUND_ENABLED, !isProduction),
  requireApiKey: parseBoolean(process.env.PLAYGROUND_REQUIRE_API_KEY, isProduction),
  apiKey: process.env.PLAYGROUND_API_KEY || '',
  defaultCoreUrl: process.env.CORE_API_URL || 'http://127.0.0.1:3125',
  defaultOpenapiUrl:
    process.env.CORE_OPENAPI_URL || 'http://127.0.0.1:3125/api/v1/openapi.json',
  environments: parseEnvironments(),
  logLevel: process.env.LOG_LEVEL || 'info',
  dataDir: process.env.DATA_DIR || path.resolve(process.cwd(), 'data'),
  publicBaseUrl: process.env.PLAYGROUND_PUBLIC_URL || `http://127.0.0.1:${port}`,
};
