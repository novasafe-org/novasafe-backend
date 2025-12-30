/**
 * Activity Log Service
 * 
 * Centralized service for creating immutable audit log entries.
 * This service is called from controllers/services to log security-relevant actions.
 * 
 * Features:
 * - Non-blocking async logging
 * - Automatic IP/user agent capture
 * - Severity mapping
 * - Organization scoping
 * - Immutable records (no update/delete)
 */

import { ObjectId } from 'mongodb';
import Database from '../../database/connection';
import { DBCONFIG } from '../../config/config';
import {
  IActivityLog,
  ActivityLogAction,
  ActivityLogSeverity,
  ActivityLogTargetType,
  ActivityLogActorRole,
  ActivityLogFilters,
  ActivityLogPagination,
  ActivityLogResponse,
} from '../models/ActivityLog';
import { ACTION_SEVERITY_MAP } from '../constants/activityLog.constants';
import logger from '../logger';

const collection = DBCONFIG.vault.collections;

/**
 * Parameters for creating an activity log entry
 */
export interface CreateActivityLogParams {
  organizationId: string; // Company name for teams/business
  actorUserId?: string | ObjectId | null;
  actorEmail?: string | null;
  actorRole?: ActivityLogActorRole;
  targetType: ActivityLogTargetType;
  targetId?: string | null;
  action: ActivityLogAction;
  description: string;
  metadata?: Record<string, any> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  location?: string | null;
  severity?: ActivityLogSeverity; // Auto-mapped if not provided
}

/**
 * Activity Log Service
 * 
 * Provides methods for creating and querying activity logs.
 * All logs are immutable and serve as audit records.
 */
class ActivityLogService {
  private db: Database;

  constructor() {
    this.db = new Database('vault');
  }

  /**
   * Create a new activity log entry
   * 
   * This is the primary method for logging events.
   * Called from controllers/services after successful operations.
   * 
   * @param params - Activity log parameters
   * @returns Promise<void> - Non-blocking, errors are logged but don't throw
   */
  async logEvent(params: CreateActivityLogParams): Promise<void> {
    try {
      // Determine severity if not provided
      const severity = params.severity || ACTION_SEVERITY_MAP[params.action] || 'info';

      // Determine actor role if not provided
      const actorRole: ActivityLogActorRole = params.actorRole || 'member';

      // Create log entry
      const logEntry: Omit<IActivityLog, '_id'> = {
        organizationId: params.organizationId,
        actorUserId: params.actorUserId ? new ObjectId(params.actorUserId) : null,
        actorEmail: params.actorEmail || null,
        actorRole,
        targetType: params.targetType,
        targetId: params.targetId || null,
        action: params.action,
        description: params.description,
        metadata: params.metadata || null,
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
        location: params.location || null,
        severity,
        createdAt: new Date(), // Always UTC
      };

      // Insert log entry (non-blocking)
      await this.db.insertOne(collection.auditLogs, logEntry);

      // Log to application logger for debugging (only in development)
      if (process.env.NODE_ENV === 'development') {
        logger.debug(
          {
            action: params.action,
            organizationId: params.organizationId,
            actorEmail: params.actorEmail,
          },
          'Activity log created'
        );
      }
    } catch (error: any) {
      // Log errors but don't throw - activity logging should never break the main flow
      logger.error(
        {
          error: error.message,
          action: params.action,
          organizationId: params.organizationId,
        },
        'Failed to create activity log'
      );
    }
  }

  /**
   * Get activity logs with filtering and pagination
   * 
   * @param organizationId - Organization to query logs for
   * @param filters - Filter criteria
   * @param pagination - Pagination options
   * @returns Activity logs response
   */
  async getLogs(
    organizationId: string,
    filters: ActivityLogFilters = {},
    pagination: ActivityLogPagination = {}
  ): Promise<ActivityLogResponse> {
    try {
      const page = pagination.page || 1;
      const limit = Math.min(pagination.limit || 50, 500); // Max 500 per page
      const skip = (page - 1) * limit;

      // Build query
      const query: any = {
        organizationId,
      };

      // Date range filter
      if (filters.startDate || filters.endDate) {
        query.createdAt = {};
        if (filters.startDate) {
          query.createdAt.$gte = filters.startDate;
        }
        if (filters.endDate) {
          query.createdAt.$lte = filters.endDate;
        }
      }

      // Action filter
      if (filters.action) {
        if (Array.isArray(filters.action)) {
          query.action = { $in: filters.action };
        } else {
          query.action = filters.action;
        }
      }

      // Actor filter
      if (filters.actorUserId) {
        query.actorUserId = new ObjectId(filters.actorUserId);
      }
      if (filters.actorEmail) {
        query.actorEmail = { $regex: filters.actorEmail, $options: 'i' };
      }

      // Target filter
      if (filters.targetType) {
        query.targetType = filters.targetType;
      }
      if (filters.targetId) {
        query.targetId = filters.targetId;
      }

      // Severity filter
      if (filters.severity) {
        if (Array.isArray(filters.severity)) {
          query.severity = { $in: filters.severity };
        } else {
          query.severity = filters.severity;
        }
      }

      // Search filter (description search)
      if (filters.search) {
        query.description = { $regex: filters.search, $options: 'i' };
      }

      // Get total count (for pagination)
      const db = this.db.getDb();
      const total = await db.collection(collection.auditLogs).countDocuments(query);

      // Fetch logs (sorted by createdAt descending - newest first)
      const logs = await db
        .collection(collection.auditLogs)
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();

      return {
        logs: logs as IActivityLog[],
        pagination: {
          page,
          limit,
          total,
          hasMore: skip + logs.length < total,
        },
      };
    } catch (error: any) {
      logger.error(error, 'Error fetching activity logs');
      throw new Error(`Failed to fetch activity logs: ${error.message}`);
    }
  }

  /**
   * Get a single activity log by ID
   * 
   * @param logId - Activity log ID
   * @param organizationId - Organization ID (for security check)
   * @returns Activity log or null
   */
  async getLogById(logId: string, organizationId: string): Promise<IActivityLog | null> {
    try {
      const log = await this.db.findOne(collection.auditLogs, {
        _id: new ObjectId(logId),
        organizationId,
      });

      return log as IActivityLog | null;
    } catch (error: any) {
      logger.error(error, 'Error fetching activity log by ID');
      throw new Error(`Failed to fetch activity log: ${error.message}`);
    }
  }

  /**
   * Export activity logs to CSV/JSON format
   * 
   * @param organizationId - Organization to export logs for
   * @param filters - Filter criteria
   * @param format - Export format ('csv' | 'json')
   * @returns Exported logs as string
   */
  async exportLogs(
    organizationId: string,
    filters: ActivityLogFilters = {},
    format: 'csv' | 'json' = 'json'
  ): Promise<string> {
    try {
      // Build query (same as getLogs)
      const query: any = {
        organizationId,
      };

      if (filters.startDate || filters.endDate) {
        query.createdAt = {};
        if (filters.startDate) {
          query.createdAt.$gte = filters.startDate;
        }
        if (filters.endDate) {
          query.createdAt.$lte = filters.endDate;
        }
      }

      if (filters.action) {
        if (Array.isArray(filters.action)) {
          query.action = { $in: filters.action };
        } else {
          query.action = filters.action;
        }
      }

      if (filters.actorUserId) {
        query.actorUserId = new ObjectId(filters.actorUserId);
      }
      if (filters.actorEmail) {
        query.actorEmail = { $regex: filters.actorEmail, $options: 'i' };
      }
      if (filters.targetType) {
        query.targetType = filters.targetType;
      }
      if (filters.targetId) {
        query.targetId = filters.targetId;
      }
      if (filters.severity) {
        if (Array.isArray(filters.severity)) {
          query.severity = { $in: filters.severity };
        } else {
          query.severity = filters.severity;
        }
      }
      if (filters.search) {
        query.description = { $regex: filters.search, $options: 'i' };
      }

      // Fetch all matching logs (no pagination for export)
      const db = this.db.getDb();
      const logs = await db
        .collection(collection.auditLogs)
        .find(query)
        .sort({ createdAt: -1 })
        .toArray();

      if (format === 'csv') {
        return this.convertToCSV(logs as IActivityLog[]);
      } else {
        return JSON.stringify(logs, null, 2);
      }
    } catch (error: any) {
      logger.error(error, 'Error exporting activity logs');
      throw new Error(`Failed to export activity logs: ${error.message}`);
    }
  }

  /**
   * Convert logs to CSV format
   */
  private convertToCSV(logs: IActivityLog[]): string {
    if (logs.length === 0) {
      return 'No logs found';
    }

    const headers = [
      'Timestamp',
      'Action',
      'Description',
      'Actor Email',
      'Actor Role',
      'Target Type',
      'Target ID',
      'Severity',
      'IP Address',
      'Location',
      'Metadata',
    ];

    const rows = logs.map((log) => {
      return [
        log.createdAt.toISOString(),
        log.action,
        log.description,
        log.actorEmail || '',
        log.actorRole,
        log.targetType,
        log.targetId || '',
        log.severity,
        log.ipAddress || '',
        log.location || '',
        log.metadata ? JSON.stringify(log.metadata) : '',
      ].map((field) => {
        // Escape CSV fields
        const str = String(field);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      });
    });

    return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
  }
}

// Export singleton instance
export const activityLogService = new ActivityLogService();

// Export class for testing
export default ActivityLogService;

