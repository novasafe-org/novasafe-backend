import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  addItemCustomField,
  createMobileItem,
  deleteItemCustomField,
  deleteMobileItem,
  deletePasswordVersionById,
  expirePasswordVersion,
  getMobileItem,
  getMobileItems,
  updateItemCustomField,
  updateMobileItem,
} from '../controllers/mobileVaultController';

const router = Router();

router.get('/items', authMiddleware, getMobileItems);
router.get('/items/:id', authMiddleware, getMobileItem);
router.post('/items', authMiddleware, createMobileItem);
router.put('/items/:id', authMiddleware, updateMobileItem);
router.delete('/items/:id', authMiddleware, deleteMobileItem);
router.post('/items/:id/custom-fields', authMiddleware, addItemCustomField);
router.put('/items/:id/custom-fields/:fieldId', authMiddleware, updateItemCustomField);
router.delete('/items/:id/custom-fields/:fieldId', authMiddleware, deleteItemCustomField);
router.post('/items/:id/password-versions/:versionId/expire', authMiddleware, expirePasswordVersion);
router.delete('/items/:id/password-versions/:versionId', authMiddleware, deletePasswordVersionById);

export default router;
