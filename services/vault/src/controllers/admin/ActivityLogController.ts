/**
 * Activity Log Controller (Admin Only)
 * 
 * Handles HTTP requests for activity log operations.
 * All endpoints require admin authentication and Team/Business plan.
 */

import { Request, Response } from 'express';
import '../../middlewares/auth';
import '../../middlewares/adminAuth';
import {
  activityLogService,
  CreateActivityLogParams,
} from '../../services/activityLogService';
import {
  ActivityLogFilters,
  ActivityLogPagination,
} from '../../models/ActivityLog';
import logger from '../../logger';

/**
 * Get activity logs with filtering and pagination
 * 
 * @route GET /admin/activity-logs
 * @access Admin (Team/Business plans only)
 */
export const getActivityLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const adminContext = (req as any).adminContext;
    if (!adminContext) {
      res.status(403).json({
        success: false,
        message: 'Forbidden',
        error: 'Admin access required',
      });
      return;
    }

    const organizationId = adminContext.organizationId;

    // IMPORTANT: Admins see ALL logs for their organization
    // The organizationId filter ensures all organization logs are returned
    // No actor filtering is applied by default - admins can see all users' activities

    // Parse query parameters
    const filters: ActivityLogFilters = {};
    const pagination: ActivityLogPagination = {};

    // Date range filters
    if (req.query.startDate) {
      filters.startDate = new Date(req.query.startDate as string);
    }
    if (req.query.endDate) {
      filters.endDate = new Date(req.query.endDate as string);
    }

    // Action filter
    if (req.query.action) {
      const action = req.query.action as string;
      if (action.includes(',')) {
        filters.action = action.split(',') as any[];
      } else {
        filters.action = action as any;
      }
    }

    // Actor filters
    if (req.query.actorUserId) {
      filters.actorUserId = req.query.actorUserId as string;
    }
    if (req.query.actorEmail) {
      filters.actorEmail = req.query.actorEmail as string;
    }

    // Target filters
    if (req.query.targetType) {
      filters.targetType = req.query.targetType as any;
    }
    if (req.query.targetId) {
      filters.targetId = req.query.targetId as string;
    }

    // Severity filter
    if (req.query.severity) {
      const severity = req.query.severity as string;
      if (severity.includes(',')) {
        filters.severity = severity.split(',') as any[];
      } else {
        filters.severity = severity as any;
      }
    }

    // Search filter
    if (req.query.search) {
      filters.search = req.query.search as string;
    }

    // Pagination
    if (req.query.page) {
      pagination.page = parseInt(req.query.page as string, 10);
    }
    if (req.query.limit) {
      pagination.limit = parseInt(req.query.limit as string, 10);
    }
    if (req.query.cursor) {
      pagination.cursor = req.query.cursor as string;
    }

    // Fetch logs
    const result = await activityLogService.getLogs(organizationId, filters, pagination);

    res.status(200).json({
      success: true,
      message: 'Activity logs retrieved successfully',
      data: result,
    });
  } catch (error: any) {
    logger.error(error, 'Error fetching activity logs');
    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: error.message || 'Failed to fetch activity logs',
      userMessage: 'Failed to load activity logs. Please try again.',
    });
  }
};

/**
 * Get a single activity log by ID
 * 
 * @route GET /admin/activity-logs/:id
 * @access Admin (Team/Business plans only)
 */
export const getActivityLogById = async (req: Request, res: Response): Promise<void> => {
  try {
    const adminContext = (req as any).adminContext;
    if (!adminContext) {
      res.status(403).json({
        success: false,
        message: 'Forbidden',
        error: 'Admin access required',
      });
      return;
    }

    const organizationId = adminContext.organizationId;
    const logId = req.params.id;

    if (!logId) {
      res.status(400).json({
        success: false,
        message: 'Bad Request',
        error: 'Log ID is required',
      });
      return;
    }

    const log = await activityLogService.getLogById(logId, organizationId);

    if (!log) {
      res.status(404).json({
        success: false,
        message: 'Not Found',
        error: 'Activity log not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Activity log retrieved successfully',
      data: log,
    });
  } catch (error: any) {
    logger.error(error, 'Error fetching activity log by ID');
    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: error.message || 'Failed to fetch activity log',
      userMessage: 'Failed to load activity log. Please try again.',
    });
  }
};

/**
 * Export activity logs
 * 
 * @route GET /admin/activity-logs/export
 * @access Admin (Team/Business plans only)
 */
export const exportActivityLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const adminContext = (req as any).adminContext;
    if (!adminContext) {
      res.status(403).json({
        success: false,
        message: 'Forbidden',
        error: 'Admin access required',
      });
      return;
    }

    const organizationId = adminContext.organizationId;

    // Parse filters - date range defaults to last 30 days if not provided
    const defaultStartDate = new Date();
    defaultStartDate.setDate(defaultStartDate.getDate() - 30);
    const defaultEndDate = new Date();

    const filters: ActivityLogFilters = {
      startDate: req.query.startDate 
        ? new Date(req.query.startDate as string) 
        : defaultStartDate,
      endDate: req.query.endDate 
        ? new Date(req.query.endDate as string) 
        : defaultEndDate,
    };

    if (req.query.action) {
      const action = req.query.action as string;
      if (action.includes(',')) {
        filters.action = action.split(',') as any[];
      } else {
        filters.action = action as any;
      }
    }

    if (req.query.actorUserId) {
      filters.actorUserId = req.query.actorUserId as string;
    }
    if (req.query.actorEmail) {
      filters.actorEmail = req.query.actorEmail as string;
    }
    if (req.query.targetType) {
      filters.targetType = req.query.targetType as any;
    }
    if (req.query.targetId) {
      filters.targetId = req.query.targetId as string;
    }
    if (req.query.severity) {
      const severity = req.query.severity as string;
      if (severity.includes(',')) {
        filters.severity = severity.split(',') as any[];
      } else {
        filters.severity = severity as any;
      }
    }
    if (req.query.search) {
      filters.search = req.query.search as string;
    }

    // Export format (default: json)
    const format = (req.query.format as 'csv' | 'json') || 'json';

    // Export logs
    const exportedData = await activityLogService.exportLogs(organizationId, filters, format);

    // Set appropriate headers
    const contentType = format === 'csv' ? 'text/csv' : 'application/json';
    const extension = format === 'csv' ? 'csv' : 'json';
    const filename = `activity-logs-${organizationId}-${Date.now()}.${extension}`;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(exportedData);
  } catch (error: any) {
    logger.error(error, 'Error exporting activity logs');
    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: error.message || 'Failed to export activity logs',
      userMessage: 'Failed to export activity logs. Please try again.',
    });
  }
};

