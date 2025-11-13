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

const router = Router();

/**
 * ALL SETTINGS ROUTES ARE PROTECTED
 * Users must be authenticated to access their settings
 * User ID is extracted from JWT token in authMiddleware
 */

// Get user settings (returns defaults if not found)
router.get('/', authMiddleware, getSettings);

// Create new user settings (with defaults)
router.post('/', authMiddleware, createSettings);

// Update user settings (partial update)
router.patch('/', authMiddleware, updateSettings);

// Reset settings to defaults
router.delete('/reset', authMiddleware, resetSettings);

// Backup vault data
router.post('/backup', authMiddleware, backupVault);

// Restore vault data
router.post('/restore', authMiddleware, restoreVault);

export default router;

