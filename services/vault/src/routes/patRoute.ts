/**
 * Personal Access Token Routes
 * 
 * API routes for managing Personal Access Tokens (PATs).
 * These routes require user authentication (JWT from browser).
 */

import { Router } from 'express';
import {
  createPATController,
  listPATsController,
  getPATController,
  revokePATController,
} from '../controllers/PATController';
import { authMiddleware } from '../middlewares/auth';

const router = Router();

// All PAT management routes require user authentication (not machine auth)
router.post('/', authMiddleware, createPATController);
router.get('/', authMiddleware, listPATsController);
router.get('/:id', authMiddleware, getPATController);
router.delete('/:id', authMiddleware, revokePATController);

export default router;


