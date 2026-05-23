import { Router } from 'express';
import { authMiddleware } from '../../auth';
import { requireEntitlement } from '../../vault/middleware/entitlement.middleware';
import {
  changeMasterPassword,
  createExport,
  deleteAccount,
  deleteExportHistoryItem,
  downloadExportById,
  getAccountDeletionSummary,
  getExportHistory,
  getSessions,
  getSettings,
  getSyncSettings,
  getTwoFactorStatus,
  importCsvData,
  revokeAllOtherSessions,
  revokeSession,
  setLoginPassword,
  updateSyncSettings,
  updateTwoFactorStatus,
  verifyMasterPassword,
} from '../controllers/settings.controller';

export const createSettingsRoutes = (): Router => {
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

  return router;
};
