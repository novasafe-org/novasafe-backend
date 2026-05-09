import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requireEntitlement } from '../middleware/entitlementGuard';
import {
  addItemCustomField,
  createMobileItem,
  deleteItemCustomField,
  deleteMobileItem,
  deletePasswordVersionById,
  expirePasswordVersion,
  bulkSyncUpload,
  pullSyncDelta,
  getMobileVaultRevision,
  getMobileItem,
  getMobileItems,
  updateItemCustomField,
  updateMobileItem,
} from '../controllers/mobileVaultController';

const router = Router();

router.get('/revision', authMiddleware, getMobileVaultRevision);
router.get('/items', authMiddleware, getMobileItems);
router.get('/items/:id', authMiddleware, getMobileItem);
router.post('/items', authMiddleware, createMobileItem);
router.put('/items/:id', authMiddleware, updateMobileItem);
router.delete('/items/:id', authMiddleware, deleteMobileItem);
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
router.post('/sync/bulk-upload', authMiddleware, bulkSyncUpload);
router.get('/sync/pull', authMiddleware, pullSyncDelta);

export default router;
