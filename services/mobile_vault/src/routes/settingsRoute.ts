import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requireEntitlement } from '../middleware/entitlementGuard';
import {
  changeMasterPassword,
  createExport,
  getExportHistory,
  getSessions,
  getSettings,
  getAccountDeletionSummary,
  getSyncSettings,
  getTwoFactorStatus,
  revokeAllOtherSessions,
  revokeSession,
  setLoginPassword,
  updateSyncSettings,
  updateTwoFactorStatus,
  deleteAccount,
  downloadExportById,
  deleteExportHistoryItem,
  importCsvData,
  verifyMasterPassword,
  sendVaultPinResetOtp,
  verifyVaultPinResetOtp,
} from '../controllers/mobileSettingsController';

const router = Router();

router.get('/', authMiddleware, getSettings);
router.get('/sync', authMiddleware, getSyncSettings);
router.post('/sync', authMiddleware, updateSyncSettings);
router.post('/change-master-password', authMiddleware, changeMasterPassword);
router.post('/verify-master-password', authMiddleware, verifyMasterPassword);
router.post('/set-login-password', authMiddleware, setLoginPassword);
router.get('/2fa/status', authMiddleware, getTwoFactorStatus);
router.post('/2fa/toggle', authMiddleware, updateTwoFactorStatus);
router.get('/sessions', authMiddleware, getSessions);
router.post('/sessions/:id/revoke', authMiddleware, revokeSession);
router.post('/sessions/revoke-others', authMiddleware, revokeAllOtherSessions);
router.post('/export', authMiddleware, requireEntitlement('canUseCSVImportExport'), createExport);
router.get('/export/history', authMiddleware, getExportHistory);
router.get('/export/:id/download', authMiddleware, downloadExportById);
router.delete('/export/history/:id', authMiddleware, deleteExportHistoryItem);
router.post('/import/csv', authMiddleware, requireEntitlement('canUseCSVImportExport'), importCsvData);
router.get('/account-summary', authMiddleware, getAccountDeletionSummary);
router.post('/delete-account', authMiddleware, deleteAccount);
router.post('/vault-pin/send-otp', authMiddleware, sendVaultPinResetOtp);
router.post('/vault-pin/verify-otp', authMiddleware, verifyVaultPinResetOtp);

export default router;
