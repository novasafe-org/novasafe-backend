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

const router = Router();

/**
 * ALL FOLDER ROUTES ARE PROTECTED
 * Users must be authenticated to access their folders
 */

// Create a new folder
router.post('/create', authMiddleware, createFolder);

// Get all folders of the logged-in user
router.get('/list', authMiddleware, getFolders);

// Get top 4 most accessed folders
router.get('/frequent', authMiddleware, getFrequentFolders);

// Get a single folder and all its items (increments accessCount)
router.get('/:id', authMiddleware, getFolderById);

// Update folder name/description
router.put('/:id', authMiddleware, updateFolder);

// Delete folder (unlinks all associated items)
router.delete('/:id', authMiddleware, deleteFolder);

export default router;

