import { Router } from 'express';
import { authMiddleware } from '../../auth';
import { asyncHandler } from '../../../middleware/async-handler';
import {
  createCardFolderHandler,
  createCardHandler,
  deleteCardFolderHandler,
  deleteCardHandler,
  getCardHandler,
  listCardFoldersHandler,
  listCardsHandler,
  updateCardHandler,
} from '../controllers/cards.controller';

export const createCardsRoutes = (): Router => {
  const router = Router();

  // Folders (before /:id)
  router.get('/folders', authMiddleware, asyncHandler(listCardFoldersHandler));
  router.post('/folders', authMiddleware, asyncHandler(createCardFolderHandler));
  router.delete('/folders/:id', authMiddleware, asyncHandler(deleteCardFolderHandler));

  router.get('/', authMiddleware, asyncHandler(listCardsHandler));
  router.get('/:id', authMiddleware, asyncHandler(getCardHandler));
  router.post('/', authMiddleware, asyncHandler(createCardHandler));
  router.put('/:id', authMiddleware, asyncHandler(updateCardHandler));
  router.patch('/:id', authMiddleware, asyncHandler(updateCardHandler));
  router.delete('/:id', authMiddleware, asyncHandler(deleteCardHandler));

  return router;
};
