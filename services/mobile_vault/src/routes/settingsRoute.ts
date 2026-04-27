import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  changeMasterPassword,
  createExport,
  getExportHistory,
  getSessions,
  getSettings,
  getAccountDeletionSummary,
  getTwoFactorStatus,
  revokeSession,
  updateTwoFactorStatus,
  deleteAccount,
} from '../controllers/mobileSettingsController';

const router = Router();

router.get('/', authMiddleware, getSettings);
router.post('/change-master-password', authMiddleware, changeMasterPassword);
router.get('/2fa/status', authMiddleware, getTwoFactorStatus);
router.post('/2fa/toggle', authMiddleware, updateTwoFactorStatus);
router.get('/sessions', authMiddleware, getSessions);
router.post('/sessions/:id/revoke', authMiddleware, revokeSession);
router.post('/export', authMiddleware, createExport);
router.get('/export/history', authMiddleware, getExportHistory);
router.get('/account-summary', authMiddleware, getAccountDeletionSummary);
router.post('/delete-account', authMiddleware, deleteAccount);

export default router;
