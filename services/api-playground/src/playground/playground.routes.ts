import { Router } from 'express';
import { playgroundConfig } from '../config/playground.config';
import { environmentRegistry } from '../environments/environment.registry';
import { CLIENT_PROFILES } from './client-profiles';
import { fetchCoreOpenApi } from '../integrations/core/core-openapi.client';
import { rewriteOpenApiForPlayground } from '../docs/openapi-rewriter';
import { coreProxyHandler, exportCurlFromHistory } from '../integrations/core/core-proxy.handler';
import { playgroundContextMiddleware } from '../middleware/playground-context.middleware';
import { tokenVaultService } from '../auth/token-vault.service';
import { historyStore } from '../history/history.store';

export const createPlaygroundRoutes = (): Router => {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({
      success: true,
      service: 'api-playground',
      enabled: playgroundConfig.enabled,
      coreDefault: playgroundConfig.defaultCoreUrl,
    });
  });

  router.get('/config', (_req, res) => {
    res.json({
      success: true,
      service: 'api-playground',
      version: '1.0.0',
      enabled: playgroundConfig.enabled,
      requireApiKey: playgroundConfig.requireApiKey,
      publicBaseUrl: playgroundConfig.publicBaseUrl,
      defaultEnvironment: 'local',
      features: {
        apiTesting: true,
        apiExploration: true,
        authenticationTesting: true,
        requestTracing: true,
        requestReplay: true,
        requestHistory: true,
        environmentSwitching: true,
        multiClientSimulation: true,
        websocketTesting: false,
        graphqlExplorer: false,
        apiAnalytics: false,
        platformSimulation: true,
      },
      scalarDocsPath: '/docs',
      openapiPath: '/api/playground/openapi.json',
      proxyPath: '/api/playground/proxy',
    });
  });

  router.get('/environments', (_req, res) => {
    res.json({ success: true, environments: environmentRegistry.list() });
  });

  router.get('/client-profiles', (_req, res) => {
    res.json({ success: true, profiles: CLIENT_PROFILES });
  });

  router.get('/openapi.json', playgroundContextMiddleware, async (req, res) => {
    try {
      const envId = req.playground?.environmentId;
      const doc = await fetchCoreOpenApi(envId);
      const rewritten = rewriteOpenApiForPlayground(doc, { environmentId: envId });
      res.json(rewritten);
    } catch (error) {
      res.status(502).json({
        success: false,
        message: 'Could not load OpenAPI from core service. Is core running?',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  const proxyRouter = Router({ mergeParams: true });
  proxyRouter.all('*', playgroundContextMiddleware, coreProxyHandler);
  router.use('/proxy', proxyRouter);

  // Auth vault (playground session only — file-backed, not for production secrets)
  router.get('/auth/vault', async (_req, res) => {
    res.json({ success: true, ...(await tokenVaultService.list()) });
  });

  router.post('/auth/vault/tokens', async (req, res) => {
    const { type, label, value, provider, expiresAt, id } = req.body ?? {};
    if (!type || !label || !value) {
      res.status(400).json({ success: false, message: 'type, label, and value are required' });
      return;
    }
    const token = await tokenVaultService.upsert({
      id,
      type,
      label,
      value,
      provider,
      expiresAt,
    });
    res.status(201).json({ success: true, token: { ...token, value: '***' } });
  });

  router.post('/auth/vault/active', async (req, res) => {
    const { tokenId } = req.body ?? {};
    await tokenVaultService.setActive(tokenId ?? null);
    res.json({ success: true, activeTokenId: tokenId ?? null });
  });

  router.delete('/auth/vault/tokens/:id', async (req, res) => {
    const removed = await tokenVaultService.remove(req.params.id);
    res.json({ success: removed });
  });

  router.delete('/auth/vault', async (_req, res) => {
    await tokenVaultService.clear();
    res.json({ success: true });
  });

  // Request history
  router.get('/history', async (req, res) => {
    const limit = Number(req.query.limit) || 50;
    res.json({ success: true, entries: await historyStore.list(limit) });
  });

  router.get('/history/:id', async (req, res) => {
    const entry = await historyStore.get(req.params.id);
    if (!entry) {
      res.status(404).json({ success: false, message: 'Not found' });
      return;
    }
    res.json({ success: true, entry });
  });

  router.get('/history/:id/export', async (req, res) => {
    const entry = await historyStore.get(req.params.id);
    if (!entry) {
      res.status(404).json({ success: false, message: 'Not found' });
      return;
    }
    const exported = exportCurlFromHistory(entry);
    res.json({ success: true, ...exported });
  });

  router.delete('/history/:id', async (req, res) => {
    res.json({ success: await historyStore.remove(req.params.id) });
  });

  router.get('/history/export/all', async (_req, res) => {
    res.json({ success: true, data: await historyStore.exportAll() });
  });

  router.post('/history/import', async (req, res) => {
    await historyStore.importAll(req.body);
    res.json({ success: true });
  });

  router.get('/collections', async (_req, res) => {
    res.json({ success: true, collections: await historyStore.listCollections() });
  });

  router.post('/collections', async (req, res) => {
    const { name, description } = req.body ?? {};
    if (!name) {
      res.status(400).json({ success: false, message: 'name is required' });
      return;
    }
    const collection = await historyStore.createCollection(name, description);
    res.status(201).json({ success: true, collection });
  });

  // Replay — re-execute via proxy instructions
  router.post('/replay/:id', async (req, res) => {
    const entry = await historyStore.get(req.params.id);
    if (!entry) {
      res.status(404).json({ success: false, message: 'Not found' });
      return;
    }
    res.json({
      success: true,
      replay: {
        method: entry.method,
        url: entry.url.replace(/^https?:\/\/[^/]+/, `${playgroundConfig.publicBaseUrl}/api/playground/proxy`),
        headers: {
          ...entry.requestHeaders,
          'x-playground-environment': entry.environmentId,
          'x-playground-client-profile': entry.clientProfileId,
        },
        note: 'POST this URL through the playground proxy or use Scalar Try It',
      },
    });
  });

  return router;
};
