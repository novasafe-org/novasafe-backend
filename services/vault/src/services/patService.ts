/**
 * Personal Access Token Service
 * 
 * Handles creation, validation, and management of Personal Access Tokens (PATs).
 * PATs are long-lived opaque tokens for machine-to-machine API access.
 */

import { ObjectId } from 'mongodb';
import Database from '../../database/connection';
import { DBCONFIG } from '../../config/config';
import { IPersonalAccessToken, IPATCreationResponse } from '../models/PersonalAccessToken';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import logger from '../logger';

const collection = DBCONFIG.vault.collections;

/**
 * Generate a secure random token for PAT
 * Format: ns_<64 random hex characters>
 */
const generatePAToken = (): string => {
  const randomBytes = crypto.randomBytes(32);
  return `ns_${randomBytes.toString('hex')}`;
};

/**
 * Create a new Personal Access Token
 */
export const createPAT = async (
  userId: string,
  name: string,
  scopes: string[],
  expiresInDays?: number
): Promise<IPATCreationResponse> => {
  try {
    const db = new Database('vault');

    // Generate token (shown only once)
    const plainToken = generatePAToken();

    // Hash the token before storage
    const hashedToken = await bcrypt.hash(plainToken, 12);

    // Calculate expiration
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    // Create PAT document
    const pat: IPersonalAccessToken = {
      name,
      hashedToken,
      userId,
      scopes,
      expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
      revokedAt: null,
    };

    const result = await db.insertOne(collection.personalAccessTokens, pat);
    const patId = result.insertedId.toString();

    logger.info({
      userId,
      patId,
      name,
      scopes
    }, 'PAT created');

    return {
      id: patId,
      name,
      token: plainToken, // Show only once
      scopes,
      expiresAt,
      createdAt: pat.createdAt,
      warning: 'Store this token securely. It will not be shown again.'
    };
  } catch (error: any) {
    logger.error(`Error creating PAT: ${error.message}`);
    throw error;
  }
};

/**
 * List all PATs for a user
 */
export const listPATs = async (userId: string): Promise<IPersonalAccessToken[]> => {
  try {
    const db = new Database('vault');

    const pats = await db.findMany(collection.personalAccessTokens, {
      userId,
      revokedAt: null
    }, {
      sort: { createdAt: -1 }
    }) as IPersonalAccessToken[];

    // Remove hashedToken from response (security)
    return pats.map(pat => {
      const { hashedToken, ...patWithoutHash } = pat;
      return patWithoutHash as IPersonalAccessToken;
    });
  } catch (error: any) {
    logger.error(`Error listing PATs: ${error.message}`);
    throw error;
  }
};

/**
 * Revoke a PAT
 */
export const revokePAT = async (
  userId: string,
  patId: string,
  reason?: string
): Promise<void> => {
  try {
    const db = new Database('vault');

    // Verify PAT belongs to user
    const pat = await db.findOne(collection.personalAccessTokens, {
      _id: new ObjectId(patId),
      userId
    }) as IPersonalAccessToken | null;

    if (!pat) {
      throw new Error('PAT not found or access denied');
    }

    if (pat.revokedAt) {
      throw new Error('PAT is already revoked');
    }

    // Revoke the PAT
    await db.updateOne(
      collection.personalAccessTokens,
      { _id: new ObjectId(patId) },
      {
        $set: {
          revokedAt: new Date(),
          revocationReason: reason || null,
          updatedAt: new Date()
        }
      }
    );

    logger.info({
      userId,
      patId,
      reason
    }, 'PAT revoked');
  } catch (error: any) {
    logger.error(`Error revoking PAT: ${error.message}`);
    throw error;
  }
};

/**
 * Get PAT by ID (for user)
 */
export const getPATById = async (
  userId: string,
  patId: string
): Promise<IPersonalAccessToken | null> => {
  try {
    const db = new Database('vault');

    const pat = await db.findOne(collection.personalAccessTokens, {
      _id: new ObjectId(patId),
      userId
    }) as IPersonalAccessToken | null;

    if (!pat) {
      return null;
    }

    // Remove hashedToken from response
    const { hashedToken, ...patWithoutHash } = pat;
    return patWithoutHash as IPersonalAccessToken;
  } catch (error: any) {
    logger.error(`Error getting PAT: ${error.message}`);
    throw error;
  }
};

