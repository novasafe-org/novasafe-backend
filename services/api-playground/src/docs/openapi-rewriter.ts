import { playgroundConfig } from '../config/playground.config';

export interface RewriteOpenApiOptions {
  environmentId?: string;
  proxyBasePath?: string;
}

/**
 * Rewrites OpenAPI servers so Scalar sends traffic through the playground proxy (same origin, no CORS).
 */
export const rewriteOpenApiForPlayground = (
  document: Record<string, unknown>,
  options: RewriteOpenApiOptions = {},
): Record<string, unknown> => {
  const proxyBase =
    options.proxyBasePath ||
    `${playgroundConfig.publicBaseUrl.replace(/\/$/, '')}/api/playground/proxy`;

  const envId = options.environmentId || 'local';

  return {
    ...document,
    info: {
      ...(document.info as Record<string, unknown>),
      title: `${(document.info as { title?: string })?.title || 'NovaSafe API'} — Playground`,
      description: [
        (document.info as { description?: string })?.description || '',
        '',
        '**NovaSafe API Playground** — requests route through the playground proxy with platform headers.',
        `Active environment: \`${envId}\`. Set header \`x-playground-environment\` or query \`?env=\` on proxy calls.`,
        'Set `x-playground-client-profile` to simulate MOBILE_ANDROID, WEB_APP, ADMIN_PANEL, etc.',
      ]
        .filter(Boolean)
        .join('\n'),
    },
    servers: [
      {
        url: proxyBase,
        description: `Playground proxy (${envId})`,
      },
    ],
    'x-playground': {
      proxyBase,
      environmentId: envId,
      clientProfiles: 'GET /api/playground/client-profiles',
      environments: 'GET /api/playground/environments',
    },
  };
};
