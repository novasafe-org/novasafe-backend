import { Router } from 'express';
import {
  getSettings,
  createSettings,
  updateSettings,
  resetSettings,
  backupVault,
  restoreVault,
} from '../controllers/Settings';
import { authMiddleware } from '../middlewares/auth';
import { loadRBACContext, requirePermission } from '../middlewares/rbac';
import { Permission } from '../constants/rbac.constants';

const router = Router();

/**
 * ALL SETTINGS ROUTES ARE PROTECTED
 * Users must be authenticated to access their settings
 * User ID is extracted from JWT token in authMiddleware
 */

// Get user settings (returns defaults if not found)
router.get('/', authMiddleware, loadRBACContext, requirePermission(Permission.SETTINGS_READ), getSettings);

// Create new user settings (with defaults)
router.post('/', authMiddleware, loadRBACContext, requirePermission(Permission.SETTINGS_UPDATE), createSettings);

// Update user settings (partial update)
router.patch('/', authMiddleware, loadRBACContext, requirePermission(Permission.SETTINGS_UPDATE), updateSettings);

// Reset settings to defaults
router.delete('/reset', authMiddleware, loadRBACContext, requirePermission(Permission.SETTINGS_UPDATE), resetSettings);

// Backup vault data
router.post('/backup', authMiddleware, loadRBACContext, requirePermission(Permission.SETTINGS_READ), backupVault);

// Restore vault data
router.post('/restore', authMiddleware, loadRBACContext, requirePermission(Permission.SETTINGS_UPDATE), restoreVault);

export default router;

