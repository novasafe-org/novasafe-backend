/**
 * Secret Usage Service
 * 
 * Handles tracking and retrieving information about where secrets are used.
 */

import { ObjectId } from 'mongodb';
import Database from '../../database/connection';
import { DBCONFIG } from '../../config/config';
import logger from '../logger';

const collection = DBCONFIG.vault.collections;

export interface SecretUsage {
  id: string;
  secretId: string;
  environment?: string;
  service?: string;
  location?: string;
  lastAccessedAt: string;
  accessCount: number;
  accessType: 'api' | 'integration' | 'manual' | 'automated';
}

export interface SecretUsageInfo {
  secretId: string;
  totalAccesses: number;
  lastAccessedAt?: string;
  usageLocations: Array<{
    environment?: string;
    service?: string;
    location?: string;
    accessCount: number;
    lastAccessedAt: string;
  }>;
  integrations: Array<{
    integrationId: string;
    integrationName?: string;
    lastSyncedAt?: string;
  }>;
}

/**
 * Get usage information for a secret
 */
export const getSecretUsage = async (
  userId: string,
  secretId: string
): Promise<SecretUsageInfo> => {
  try {
    const db = new Database('vault');
    const mongoDb = db.getDb();

    // Verify secret belongs to user
    const secret = await db.findOne(collection.secrets, {
      _id: new ObjectId(secretId),
      userId: new ObjectId(userId),
    });

    if (!secret) {
      throw new Error('Secret not found or access denied');
    }

    // Get access logs for this secret
    const accessLogs = await db.findMany(
      collection.secretAccessLogs,
      {
        secretId: new ObjectId(secretId),
      },
      {
        sort: { accessedAt: -1 },
        limit: 100,
      }
    ) as any[];

    // Aggregate usage by IP address and user agent (to identify services/environments)
    const usageMap = new Map<string, {
      environment?: string;
      service?: string;
      location?: string;
      accessCount: number;
      lastAccessedAt: string;
    }>();

    accessLogs.forEach((log: any) => {
      // Try to infer environment/service from IP or user agent
      const ipAddress = log.ipAddress || 'unknown';
      const userAgent = log.userAgent || '';
      
      // Infer environment from IP patterns (simplified - in production, use IP geolocation or config)
      let environment = 'production';
      if (ipAddress.includes('192.168') || ipAddress.includes('10.0') || ipAddress.includes('127.0')) {
        environment = 'development';
      } else if (ipAddress.includes('staging') || userAgent.toLowerCase().includes('staging')) {
        environment = 'staging';
      }
      
      // Infer service from user agent
      let service = 'unknown';
      if (userAgent.toLowerCase().includes('github')) {
        service = 'GitHub Actions';
      } else if (userAgent.toLowerCase().includes('gitlab')) {
        service = 'GitLab CI';
      } else if (userAgent.toLowerCase().includes('jenkins')) {
        service = 'Jenkins';
      } else if (userAgent.toLowerCase().includes('aws')) {
        service = 'AWS Lambda';
      } else if (userAgent.toLowerCase().includes('azure')) {
        service = 'Azure Functions';
      } else if (userAgent.toLowerCase().includes('gcp') || userAgent.toLowerCase().includes('google')) {
        service = 'GCP Cloud Functions';
      } else if (userAgent.toLowerCase().includes('terraform')) {
        service = 'Terraform';
      } else if (userAgent.toLowerCase().includes('ansible')) {
        service = 'Ansible';
      } else if (userAgent.toLowerCase().includes('kubernetes') || userAgent.toLowerCase().includes('k8s')) {
        service = 'Kubernetes';
      } else if (log.action === 'view' && !userAgent) {
        service = 'Web UI';
      }
      
      const location = `${environment}-${service}`;
      const key = `${environment}_${service}_${ipAddress}`;
      
      const existing = usageMap.get(key) || {
        environment,
        service,
        location,
        accessCount: 0,
        lastAccessedAt: log.accessedAt,
      };

      existing.accessCount++;
      if (new Date(log.accessedAt) > new Date(existing.lastAccessedAt)) {
        existing.lastAccessedAt = log.accessedAt;
      }

      usageMap.set(key, existing);
    });

    // Get integration information if secret has integrationId
    const integrations: Array<{
      integrationId: string;
      integrationName?: string;
      lastSyncedAt?: string;
    }> = [];

    if (secret.integrationId) {
      // In a real implementation, you'd fetch integration details
      integrations.push({
        integrationId: secret.integrationId,
        lastSyncedAt: secret.updatedAt,
      });
    }

    const usageLocations = Array.from(usageMap.values());

    return {
      secretId,
      totalAccesses: accessLogs.length,
      lastAccessedAt: accessLogs[0]?.accessedAt,
      usageLocations,
      integrations,
    };
  } catch (error: any) {
    logger.error(`Error getting secret usage: ${error.message}`);
    throw error;
  }
};

