import { Router } from 'express';
import { authMiddleware } from '../../auth';
import {
  createFolderHandler,
  deleteFolderHandler,
  getFolder,
  getFolders,
  updateFolderHandler,
} from '../controllers/folders.controller';

export const createFoldersRoutes = (): Router => {
  const router = Router();

  router.get('/', authMiddleware, getFolders);
  router.get('/:id', authMiddleware, getFolder);
  router.post('/', authMiddleware, createFolderHandler);
  router.put('/:id', authMiddleware, updateFolderHandler);
  router.delete('/:id', authMiddleware, deleteFolderHandler);

  return router;
};
