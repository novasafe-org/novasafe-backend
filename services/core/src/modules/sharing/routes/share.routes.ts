import { Router } from 'express';
import { authMiddleware } from '../../auth';
import { asyncHandler } from '../../../middleware/async-handler';
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

  // asyncHandler so create/email failures reach Express error middleware (not bare API GW 500s).
  router.get('/list', authMiddleware, asyncHandler(listShares));
  router.post('/resolve-recipients', authMiddleware, asyncHandler(resolveShareRecipients));
  router.post('/create', authMiddleware, asyncHandler(createShare));
  /** Legacy path used by older clients / web. */
  router.post('/send', authMiddleware, asyncHandler(sendShareInvite));

  router.get('/access/:token', asyncHandler(publicAccessByToken));

  router.get('/:shareId', authMiddleware, asyncHandler(getShare));
  router.post('/:shareId/revoke-all', authMiddleware, asyncHandler(revokeShareAll));
  router.post('/:shareId/accept', authMiddleware, asyncHandler(acceptShareInvite));
  router.post('/:shareId/decline', authMiddleware, asyncHandler(declineShareInvite));
  router.post('/:shareId/touch', authMiddleware, asyncHandler(openReceivedShare));
  router.post(
    '/:shareId/recipients/:recipientId/revoke',
    authMiddleware,
    asyncHandler(revokeShareRecipient),
  );
  router.post(
    '/:shareId/recipients/:recipientId/suspend',
    authMiddleware,
    asyncHandler(suspendShareRecipient),
  );
  router.post(
    '/:shareId/recipients/:recipientId/unsuspend',
    authMiddleware,
    asyncHandler(unsuspendShareRecipient),
  );

  return router;
};
