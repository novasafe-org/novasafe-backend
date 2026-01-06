/**
 * Secrets UI Routes
 * 
 * UI routes for the Secrets Manager feature (browser access).
 * These routes accept user JWTs from the browser.
 * 
 * IMPORTANT: These are for UI access only. Machine API access should use
 * /api/v1/secrets endpoints with PAT or Service Account authentication.
 */

import { Router } from 'express';
import {
  createSecretController,
  getSecretsController,
  getSecretController,
  updateSecretController,
  deleteSecretController,
  trackSecretAccessController,
  rotateSecretController,
  getSecretVersionsController,
} from '../controllers/Secrets';
import { getSecretUsageController } from '../controllers/SecretUsageController';
import { authMiddleware } from '../middlewares/auth';
import { loadRBACContext, requirePermission } from '../middlewares/rbac';
import { Permission } from '../constants/rbac.constants';

const router = Router();

/**
 * UI SECRETS ROUTES - Accept User JWTs
 * These routes are for browser/UI access only
 */

// Get all secrets for authenticated user
router.get(
  '/',
  authMiddleware,
  loadRBACContext,
  requirePermission(Permission.SECRETS_READ),
  getSecretsController
);

// Get a single secret by ID
router.get(
  '/:id',
  authMiddleware,
  loadRBACContext,
  requirePermission(Permission.SECRETS_READ),
  getSecretController
);

// Create a new secret
router.post(
  '/',
  authMiddleware,
  loadRBACContext,
  requirePermission(Permission.SECRETS_CREATE),
  createSecretController
);

// Update a secret
router.put(
  '/:id',
  authMiddleware,
  loadRBACContext,
  requirePermission(Permission.SECRETS_UPDATE),
  updateSecretController
);

// Delete a secret (soft delete)
router.delete(
  '/:id',
  authMiddleware,
  loadRBACContext,
  requirePermission(Permission.SECRETS_DELETE),
  deleteSecretController
);

// Track secret access
router.post(
  '/:id/trackAccess',
  authMiddleware,
  trackSecretAccessController
);

// Rotate a secret
router.post(
  '/:id/rotate',
  authMiddleware,
  loadRBACContext,
  requirePermission(Permission.SECRETS_UPDATE),
  rotateSecretController
);

// Get secret versions
router.get(
  '/:id/versions',
  authMiddleware,
  loadRBACContext,
  requirePermission(Permission.SECRETS_READ),
  getSecretVersionsController
);

// Get secret usage information
router.get(
  '/:id/usage',
  authMiddleware,
  loadRBACContext,
  requirePermission(Permission.SECRETS_READ),
  getSecretUsageController
);

export default router;

