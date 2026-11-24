import { Router } from 'express';
import { authMiddleware } from '../../auth';
import {
  createAuthenticatorEntryHandler,
  deleteAuthenticatorEntryHandler,
  getAuthenticatorEntryHandler,
  linkAuthenticatorEntryHandler,
  listAuthenticatorEntriesHandler,
  touchAuthenticatorEntryHandler,
  updateAuthenticatorEntryHandler,
} from '../controllers/authenticator.controller';

export const createAuthenticatorRoutes = (): Router => {
  const router = Router();

  router.get('/', authMiddleware, listAuthenticatorEntriesHandler);
  router.get('/:id', authMiddleware, getAuthenticatorEntryHandler);
  router.post('/', authMiddleware, createAuthenticatorEntryHandler);
  router.put('/:id', authMiddleware, updateAuthenticatorEntryHandler);
  router.delete('/:id', authMiddleware, deleteAuthenticatorEntryHandler);
  router.post('/:id/link', authMiddleware, linkAuthenticatorEntryHandler);
  router.post('/:id/touch', authMiddleware, touchAuthenticatorEntryHandler);

  return router;
};
