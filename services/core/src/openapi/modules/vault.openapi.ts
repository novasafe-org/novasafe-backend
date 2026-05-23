import type { OpenApiDocument } from '../types/openapi.types';

const bearer = [{ bearerAuth: [] }];
const platformHeaders = [
  { $ref: '#/components/parameters/XClientSource' },
  { $ref: '#/components/parameters/XClientPlatform' },
];

const authedGet = (tags: string[], summary: string, operationId: string) => ({
  tags,
  operationId,
  summary,
  security: bearer,
  parameters: platformHeaders,
  responses: {
    '200': { description: 'Success' },
    '401': { description: 'Unauthorized' },
  },
});

/** Vault paths — `/api/v1/vault` and legacy `/mobile/vault`. */
export const buildVaultOpenApiPaths = (): OpenApiDocument['paths'] => ({
  '/api/v1/vault/revision': {
    get: authedGet(['Vault'], 'Vault data revision', 'getVaultRevision'),
  },
  '/api/v1/vault/items': {
    get: authedGet(['Vault'], 'List vault items', 'listVaultItems'),
    post: {
      tags: ['Vault'],
      operationId: 'createVaultItem',
      summary: 'Create vault item',
      security: bearer,
      parameters: platformHeaders,
      responses: { '201': { description: 'Created' }, '401': { description: 'Unauthorized' }, '403': { description: 'Plan limit' } },
    },
  },
  '/api/v1/vault/items/{id}': {
    get: authedGet(['Vault'], 'Get vault item', 'getVaultItem'),
    put: authedGet(['Vault'], 'Update vault item', 'updateVaultItem'),
    delete: authedGet(['Vault'], 'Delete vault item', 'deleteVaultItem'),
  },
  '/api/v1/vault/sync/bulk-upload': {
    post: authedGet(['Vault', 'Sync'], 'Bulk sync upload', 'vaultBulkSyncUpload'),
  },
  '/api/v1/vault/sync/pull': {
    get: authedGet(['Vault', 'Sync'], 'Pull sync delta', 'vaultPullSyncDelta'),
  },
  '/mobile/vault/revision': {
    get: authedGet(['Vault (Legacy)'], 'Vault revision (legacy)', 'mobileVaultRevision'),
  },
  '/mobile/vault/items': {
    get: authedGet(['Vault (Legacy)'], 'List items (legacy)', 'mobileListVaultItems'),
  },
});
