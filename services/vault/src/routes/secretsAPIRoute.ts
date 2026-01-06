/**
 * Secrets Machine API Routes
 * 
 * Machine-to-machine API routes for the Secrets Manager.
 * These routes ONLY accept PAT tokens or Service Account credentials.
 * User JWTs from browser are EXPLICITLY REJECTED.
 * 
 * Use these endpoints for:
 * - CI/CD pipelines
 * - Scripts and automation
 * - Third-party integrations
 * - Backend services
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
import { machineAuthMiddleware } from '../middlewares/machineAuth';

const router = Router();

/**
 * MACHINE API SECRETS ROUTES - PAT/Service Account Only
 * User JWTs are EXPLICITLY REJECTED for security
 */

// Get all secrets for authenticated machine client
router.get(
  '/',
  machineAuthMiddleware(['secrets:read']),
  getSecretsController
);

// Get a single secret by ID
router.get(
  '/:id',
  machineAuthMiddleware(['secrets:read']),
  getSecretController
);

// Create a new secret
router.post(
  '/',
  machineAuthMiddleware(['secrets:write']),
  createSecretController
);

// Update a secret
router.put(
  '/:id',
  machineAuthMiddleware(['secrets:write']),
  updateSecretController
);

// Delete a secret (soft delete)
router.delete(
  '/:id',
  machineAuthMiddleware(['secrets:write']),
  deleteSecretController
);

// Track secret access
router.post(
  '/:id/trackAccess',
  machineAuthMiddleware(['secrets:read']),
  trackSecretAccessController
);

// Rotate a secret
router.post(
  '/:id/rotate',
  machineAuthMiddleware(['secrets:rotate']),
  rotateSecretController
);

// Get secret versions
router.get(
  '/:id/versions',
  machineAuthMiddleware(['secrets:read']),
  getSecretVersionsController
);

// Get secret usage information
router.get(
  '/:id/usage',
  machineAuthMiddleware(['secrets:read']),
  getSecretUsageController
);

export default router;

