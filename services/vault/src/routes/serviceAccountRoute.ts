/**
 * Service Account Routes
 * 
 * API routes for managing Service Accounts.
 * These routes require user authentication (JWT from browser).
 */

import { Router } from 'express';
import {
  createServiceAccountController,
  listServiceAccountsController,
  getServiceAccountController,
  revokeServiceAccountController,
} from '../controllers/ServiceAccountController';
import { authMiddleware } from '../middlewares/auth';

const router = Router();

// All Service Account management routes require user authentication (not machine auth)
router.post('/', authMiddleware, createServiceAccountController);
router.get('/', authMiddleware, listServiceAccountsController);
router.get('/:id', authMiddleware, getServiceAccountController);
router.delete('/:id', authMiddleware, revokeServiceAccountController);

export default router;


