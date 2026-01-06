/**
 * Service Account Service
 * 
 * Handles creation, validation, and management of Service Accounts.
 * Service Accounts use Client ID + Client Secret authentication.
 */

import { ObjectId } from 'mongodb';
import Database from '../../database/connection';
import { DBCONFIG } from '../../config/config';
import { IServiceAccount, IServiceAccountCreationResponse } from '../models/ServiceAccount';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import logger from '../logger';

const collection = DBCONFIG.vault.collections;

/**
 * Generate a secure client ID
 * Format: ns_sa_<32 random hex characters>
 */
const generateClientId = (): string => {
  const randomBytes = crypto.randomBytes(16);
  return `ns_sa_${randomBytes.toString('hex')}`;
};

/**
 * Generate a secure client secret
 * Format: <64 random hex characters>
 */
const generateClientSecret = (): string => {
  const randomBytes = crypto.randomBytes(32);
  return randomBytes.toString('hex');
};

/**
 * Create a new Service Account
 */
export const createServiceAccount = async (
  userId: string,
  name: string,
  scopes: string[],
  allowedEnvironments?: string[],
  allowedIpRanges?: string[],
  expiresInDays?: number
): Promise<IServiceAccountCreationResponse> => {
  try {
    const db = new Database('vault');

    // Generate credentials (shown only once)
    const clientId = generateClientId();
    const plainClientSecret = generateClientSecret();

    // Hash the client secret before storage
    const hashedClientSecret = await bcrypt.hash(plainClientSecret, 12);

    // Calculate expiration
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    // Create Service Account document
    const serviceAccount: IServiceAccount = {
      name,
      clientId,
      hashedClientSecret,
      userId,
      scopes,
      allowedEnvironments: allowedEnvironments || [],
      allowedIpRanges: allowedIpRanges || [],
      expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
      revokedAt: null,
    };

    const result = await db.insertOne(collection.serviceAccounts, serviceAccount);
    const accountId = result.insertedId.toString();

    logger.info({
      userId,
      accountId,
      name,
      scopes,
      clientId
    }, 'Service Account created');

    return {
      id: accountId,
      name,
      clientId,
      clientSecret: plainClientSecret, // Show only once
      scopes,
      expiresAt,
      createdAt: serviceAccount.createdAt,
      warning: 'Store this secret securely. It will not be shown again.'
    };
  } catch (error: any) {
    logger.error(`Error creating Service Account: ${error.message}`);
    throw error;
  }
};

/**
 * List all Service Accounts for a user
 */
export const listServiceAccounts = async (userId: string): Promise<IServiceAccount[]> => {
  try {
    const db = new Database('vault');

    const accounts = await db.findMany(collection.serviceAccounts, {
      userId,
      revokedAt: null
    }, {
      sort: { createdAt: -1 }
    }) as IServiceAccount[];

    // Remove hashedClientSecret from response (security)
    return accounts.map(account => {
      const { hashedClientSecret, ...accountWithoutSecret } = account;
      return accountWithoutSecret as IServiceAccount;
    });
  } catch (error: any) {
    logger.error(`Error listing Service Accounts: ${error.message}`);
    throw error;
  }
};

/**
 * Revoke a Service Account
 */
export const revokeServiceAccount = async (
  userId: string,
  accountId: string,
  reason?: string
): Promise<void> => {
  try {
    const db = new Database('vault');

    // Verify Service Account belongs to user
    const account = await db.findOne(collection.serviceAccounts, {
      _id: new ObjectId(accountId),
      userId
    }) as IServiceAccount | null;

    if (!account) {
      throw new Error('Service Account not found or access denied');
    }

    if (account.revokedAt) {
      throw new Error('Service Account is already revoked');
    }

    // Revoke the Service Account
    await db.updateOne(
      collection.serviceAccounts,
      { _id: new ObjectId(accountId) },
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
      accountId,
      clientId: account.clientId,
      reason
    }, 'Service Account revoked');
  } catch (error: any) {
    logger.error(`Error revoking Service Account: ${error.message}`);
    throw error;
  }
};

/**
 * Get Service Account by ID (for user)
 */
export const getServiceAccountById = async (
  userId: string,
  accountId: string
): Promise<IServiceAccount | null> => {
  try {
    const db = new Database('vault');

    const account = await db.findOne(collection.serviceAccounts, {
      _id: new ObjectId(accountId),
      userId
    }) as IServiceAccount | null;

    if (!account) {
      return null;
    }

    // Remove hashedClientSecret from response
    const { hashedClientSecret, ...accountWithoutSecret } = account;
    return accountWithoutSecret as IServiceAccount;
  } catch (error: any) {
    logger.error(`Error getting Service Account: ${error.message}`);
    throw error;
  }
};

