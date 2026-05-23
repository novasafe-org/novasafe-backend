import { Express } from 'express';
import { apiReference } from '@scalar/express-api-reference';
import { playgroundConfig } from '../config/playground.config';

/**
 * Modern API reference UI (Scalar) — replaces basic Swagger UI.
 */
export const mountScalarDocs = (app: Express): void => {
  app.use(
    '/docs',
    apiReference({
      theme: 'kepler',
      darkMode: true,
      metaData: {
        title: 'NovaSafe API Playground',
        description: 'Enterprise API explorer for the NovaSafe platform',
      },
      spec: {
        url: '/api/playground/openapi.json',
      },
      authentication: {
        preferredSecurityScheme: 'bearerAuth',
        securitySchemes: {
          bearerAuth: {
            token: '',
          },
        },
      },
      customCss: `
        :root { --scalar-font: system-ui, -apple-system, sans-serif; }
      `,
    }),
  );

  app.get('/', (_req, res) => {
    res.redirect('/docs');
  });

  app.get('/explorer', (_req, res) => {
    res.redirect('/docs');
  });

  // Developer panel — lightweight bootstrap for environment/client hints
  app.get('/developer-panel.json', (_req, res) => {
    res.json({
      playground: playgroundConfig.publicBaseUrl,
      docs: `${playgroundConfig.publicBaseUrl}/docs`,
      headers: {
        environment: 'x-playground-environment',
        clientProfile: 'x-playground-client-profile',
        accessToken: 'x-playground-access-token',
      },
      note: 'Set playground headers on proxy requests or configure via REST API under /api/playground',
    });
  });
};
