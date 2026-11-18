import { Router } from 'express';
import { authMiddleware } from '../../auth';
import {
  acceptShareInvite,
  createShare,
  declineShareInvite,
  getShare,
  listShares,
  openReceivedShare,
  publicAccessByToken,
  resolveShareRecipients,
  revokeShareAll,
  revokeShareRecipient,
  sendShareInvite,
  suspendShareRecipient,
  unsuspendShareRecipient,
} from '../controllers/share.controller';

export const createShareRoutes = (): Router => {
  const router = Router();

  router.get('/list', authMiddleware, listShares);
  router.post('/resolve-recipients', authMiddleware, resolveShareRecipients);
  router.post('/create', authMiddleware, createShare);
  /** Legacy path used by older clients / web. */
  router.post('/send', authMiddleware, sendShareInvite);

  router.get('/access/:token', publicAccessByToken);

  router.get('/:shareId', authMiddleware, getShare);
  router.post('/:shareId/revoke-all', authMiddleware, revokeShareAll);
  router.post('/:shareId/accept', authMiddleware, acceptShareInvite);
  router.post('/:shareId/decline', authMiddleware, declineShareInvite);
  router.post('/:shareId/touch', authMiddleware, openReceivedShare);
  router.post('/:shareId/recipients/:recipientId/revoke', authMiddleware, revokeShareRecipient);
  router.post('/:shareId/recipients/:recipientId/suspend', authMiddleware, suspendShareRecipient);
  router.post('/:shareId/recipients/:recipientId/unsuspend', authMiddleware, unsuspendShareRecipient);

  return router;
};
