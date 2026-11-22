import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../../auth';
import { requireEntitlement } from '../middleware/entitlement.middleware';
import {
  deleteItemAttachmentHandler,
  downloadItemAttachmentHandler,
  getItemAttachmentHandler,
  listItemAttachmentsHandler,
  uploadItemAttachmentHandler,
} from '../controllers/item-attachments.controller';
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
  moveVaultItemFolder,
  updateItemCustomField,
  updateVaultItem,
  vaultBulkSyncUpload,
  vaultPullSyncDelta,
} from '../controllers/vault.controller';

const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.NAS_MAX_UPLOAD_BYTES || 5 * 1024 * 1024),
  },
});

export const createVaultRoutes = (): Router => {
  const router = Router();

  router.get('/revision', authMiddleware, getVaultRevision);
  router.get('/items', authMiddleware, getVaultItems);
  router.get('/items/:id', authMiddleware, getVaultItem);
  router.post('/items', authMiddleware, createVaultItem);
  router.put('/items/:id', authMiddleware, updateVaultItem);
  router.put('/items/:id/folder', authMiddleware, moveVaultItemFolder);
  router.delete('/items/:id', authMiddleware, deleteVaultItem);

  // Per-item NAS attachments: novasafe/<userId>/items attachments/<itemId>/…
  router.get('/items/:itemId/attachments', authMiddleware, listItemAttachmentsHandler);
  router.get('/items/:itemId/attachments/:attachmentId', authMiddleware, getItemAttachmentHandler);
  router.get(
    '/items/:itemId/attachments/:attachmentId/download',
    authMiddleware,
    downloadItemAttachmentHandler,
  );
  router.post(
    '/items/:itemId/attachments/upload',
    authMiddleware,
    attachmentUpload.single('file'),
    uploadItemAttachmentHandler,
  );
  router.delete(
    '/items/:itemId/attachments/:attachmentId',
    authMiddleware,
    deleteItemAttachmentHandler,
  );
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
