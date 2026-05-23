import { Router } from 'express';
import { authMiddleware } from '../../auth';
import { requireEntitlement } from '../middleware/entitlement.middleware';
import {
  addItemCustomField,
  createVaultItem,
  deleteItemCustomField,
  deletePasswordVersionById,
  deleteVaultItem,
  expirePasswordVersion,
  getVaultItem,
  getVaultItems,
  getVaultRevision,
  updateItemCustomField,
  updateVaultItem,
  vaultBulkSyncUpload,
  vaultPullSyncDelta,
} from '../controllers/vault.controller';

export const createVaultRoutes = (): Router => {
  const router = Router();

  router.get('/revision', authMiddleware, getVaultRevision);
  router.get('/items', authMiddleware, getVaultItems);
  router.get('/items/:id', authMiddleware, getVaultItem);
  router.post('/items', authMiddleware, createVaultItem);
  router.put('/items/:id', authMiddleware, updateVaultItem);
  router.delete('/items/:id', authMiddleware, deleteVaultItem);
  router.post('/items/:id/custom-fields', authMiddleware, addItemCustomField);
  router.put('/items/:id/custom-fields/:fieldId', authMiddleware, updateItemCustomField);
  router.delete('/items/:id/custom-fields/:fieldId', authMiddleware, deleteItemCustomField);
  router.post(
    '/items/:id/password-versions/:versionId/expire',
    authMiddleware,
    requireEntitlement('canUsePasswordHistory'),
    expirePasswordVersion,
  );
  router.delete(
    '/items/:id/password-versions/:versionId',
    authMiddleware,
    requireEntitlement('canUsePasswordHistory'),
    deletePasswordVersionById,
  );
  router.post('/sync/bulk-upload', authMiddleware, vaultBulkSyncUpload);
  router.get('/sync/pull', authMiddleware, vaultPullSyncDelta);

  return router;
};
