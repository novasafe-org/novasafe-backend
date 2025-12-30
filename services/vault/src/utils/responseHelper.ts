/**
 * Response Helper
 * 
 * Utilities for creating consistent API responses with RBAC permissions.
 * All authenticated API responses should include user permissions.
 */

import { Response } from 'express';
import { Request } from 'express';
import { attachUserPermissions } from '../middlewares/rbac';

/**
 * Add user permissions to response data
 * Use this helper to ensure all responses include permissions
 */
export const addUserPermissionsToResponse = (req: Request, data: any): any => {
  if (!req.rbacContext) {
    return data;
  }

  try {
    const userPermissions = attachUserPermissions(req);
    return {
      ...data,
      user: userPermissions,
    };
  } catch (error) {
    // If permissions can't be attached, return data without permissions
    return data;
  }
};

/**
 * Send success response with user permissions
 */
export const sendSuccessResponse = (
  req: Request,
  res: Response,
  data: any,
  statusCode: number = 200
): void => {
  const response = addUserPermissionsToResponse(req, {
    success: true,
    ...data,
  });

  res.status(statusCode).json(response);
};

/**
 * Send error response
 */
export const sendErrorResponse = (
  res: Response,
  message: string,
  error: string,
  statusCode: number = 500,
  userMessage?: string
): void => {
  res.status(statusCode).json({
    success: false,
    message,
    error,
    userMessage: userMessage || message,
  });
};

