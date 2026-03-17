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
import { requireActiveSubscription } from '../middlewares/subscriptionMiddleware';
import { Permission } from '../constants/rbac.constants';

const router = Router();

/** Subscription/trial required for folder access (enforced server-side) */
const folderGuards = [authMiddleware, loadRBACContext, requireActiveSubscription];

/**
 * ALL FOLDER ROUTES ARE PROTECTED
 * Users must be authenticated and have active subscription/trial to access folders
 */

// Create a new folder
router.post('/create', ...folderGuards, requirePermission(Permission.VAULT_CREATE), createFolder);

// Get all folders of the logged-in user
router.get('/list', ...folderGuards, requirePermission(Permission.VAULT_READ), getFolders);

// Get top 4 most accessed folders
router.get('/frequent', ...folderGuards, requirePermission(Permission.VAULT_READ), getFrequentFolders);

// Get a single folder and all its items (increments accessCount)
router.get('/:id', ...folderGuards, requirePermission(Permission.VAULT_READ), getFolderById);

// Update folder name/description
router.put('/:id', ...folderGuards, requirePermission(Permission.VAULT_UPDATE), updateFolder);

// Delete folder (unlinks all associated items)
router.delete('/:id', ...folderGuards, requirePermission(Permission.VAULT_DELETE), deleteFolder);

export default router;

