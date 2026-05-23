import { Router } from 'express';
import { appConfig } from '../../config';
import { buildOpenApiDocument } from '../../openapi';

export const createDocsRoutes = (): Router => {
  const router = Router();

  router.get('/openapi.json', (req, res) => {
    const proto = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const baseUrl = host ? `${proto}://${host}` : `http://127.0.0.1:${appConfig.port}`;
    res.json(buildOpenApiDocument({ baseUrl }));
  });

  router.get('/openapi.yaml', (_req, res) => {
    res.status(501).json({
      success: false,
      message: 'YAML export not implemented yet. Use /api/v1/openapi.json',
    });
  });

  return router;
};
