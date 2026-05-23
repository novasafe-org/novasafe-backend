export type OpenApiMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface OpenApiOperation {
  tags?: string[];
  summary?: string;
  description?: string;
  operationId?: string;
  security?: Array<Record<string, string[]>>;
  parameters?: unknown[];
  requestBody?: unknown;
  responses: Record<string, unknown>;
}

export interface OpenApiDocument {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
    contact?: { name: string; url?: string };
  };
  servers: Array<{ url: string; description?: string; variables?: Record<string, unknown> }>;
  tags?: Array<{ name: string; description?: string }>;
  paths: Record<string, Partial<Record<OpenApiMethod, OpenApiOperation>>>;
  components?: Record<string, unknown>;
  'x-platform-headers'?: Record<string, string>;
}
