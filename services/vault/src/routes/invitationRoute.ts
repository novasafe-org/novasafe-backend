/**
 * Invitation Routes (Public)
 * 
 * Public routes for invitation acceptance
 * These routes do not require authentication
 */

import { Router } from 'express';
import {
  getInvitationByTokenController,
  acceptInvitationController,
} from '../controllers/AccessManagementController';

const router = Router();

// Public routes - no authentication required
router.get('/verify/:token', getInvitationByTokenController);
router.post('/accept', acceptInvitationController);

export default router;

