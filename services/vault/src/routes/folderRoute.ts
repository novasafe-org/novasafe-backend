import { Router } from 'express';
import {
  createFolder,
  getFolders,
  getFrequentFolders,
  getFolderById,
  updateFolder,
  deleteFolder
} from '../controllers/Folder';
import { authMiddleware } from '../middlewares/auth';
import { loadRBACContext, requirePermission } from '../middlewares/rbac';
import { Permission } from '../constants/rbac.constants';

const router = Router();

/**
 * ALL FOLDER ROUTES ARE PROTECTED
 * Users must be authenticated to access their folders
 */

// Create a new folder
router.post('/create', authMiddleware, loadRBACContext, requirePermission(Permission.VAULT_CREATE), createFolder);

// Get all folders of the logged-in user
router.get('/list', authMiddleware, loadRBACContext, requirePermission(Permission.VAULT_READ), getFolders);

// Get top 4 most accessed folders
router.get('/frequent', authMiddleware, loadRBACContext, requirePermission(Permission.VAULT_READ), getFrequentFolders);

// Get a single folder and all its items (increments accessCount)
router.get('/:id', authMiddleware, loadRBACContext, requirePermission(Permission.VAULT_READ), getFolderById);

// Update folder name/description
router.put('/:id', authMiddleware, loadRBACContext, requirePermission(Permission.VAULT_UPDATE), updateFolder);

// Delete folder (unlinks all associated items)
router.delete('/:id', authMiddleware, loadRBACContext, requirePermission(Permission.VAULT_DELETE), deleteFolder);

export default router;

