// @ts-nocheck
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachUserPermissions = exports.requireAllPermissions = exports.requirePermission = exports.requireRole = exports.loadRBACContext = void 0;
require("./auth");
const rbacService_1 = require("../services/rbacService");
const logger_1 = __importDefault(require("../logger"));
const getOrganizationId = async (req) => {
    const userId = req.user?.id;
    if (!userId)
        throw new Error('User not authenticated');
    const explicitWorkspaceId = req.body?.workspace_id ||
        req.params?.workspace_id ||
        req.query?.workspace_id ||
        req.headers['x-workspace-id'] ||
        req.body?.organizationId ||
        req.params?.organizationId ||
        req.query?.organizationId;
    if (explicitWorkspaceId) {
        const { userBelongsToWorkspace, getDefaultWorkspaceIdForUser } = await Promise.resolve().then(() => __importStar(require('../services/workspaceService')));
        const belongs = await userBelongsToWorkspace(userId, String(explicitWorkspaceId).trim());
        if (belongs)
            return String(explicitWorkspaceId).trim();
        logger_1.default.warn({ userId, requestedWorkspaceId: explicitWorkspaceId }, 'Workspace access denied: user not a member, using default workspace');
        return getDefaultWorkspaceIdForUser(userId);
    }
    const { getDefaultWorkspaceIdForUser } = await Promise.resolve().then(() => __importStar(require('../services/workspaceService')));
    return getDefaultWorkspaceIdForUser(userId);
};
const loadRBACContext = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({
                success: false,
                message: 'Unauthorized',
                error: 'Authentication required',
            });
            return;
        }
        const organizationId = await getOrganizationId(req);
        const role = await (0, rbacService_1.getUserRole)(userId, organizationId);
        const permissions = await (0, rbacService_1.getUserPermissions)(userId, organizationId);
        req.rbacContext = {
            userId,
            organizationId,
            role,
            permissions,
        };
        next();
    }
    catch (error) {
        logger_1.default.error({ error: error.message }, 'Failed to load RBAC context');
        res.status(500).json({
            success: false,
            message: 'Failed to load access control context',
            error: error.message,
        });
    }
};
exports.loadRBACContext = loadRBACContext;
const requireRole = (...allowedRoles) => {
    return async (req, res, next) => {
        try {
            if (!req.rbacContext) {
                await (0, exports.loadRBACContext)(req, res, () => { });
                if (!req.rbacContext)
                    return;
            }
            const { role } = req.rbacContext;
            if (!allowedRoles.includes(role)) {
                logger_1.default.warn({ userId: req.rbacContext.userId, role, allowedRoles }, 'Access denied: insufficient role');
                res.status(403).json({
                    success: false,
                    message: 'Forbidden',
                    error: `This action requires one of the following roles: ${allowedRoles.join(', ')}`,
                    userMessage: 'You do not have permission to perform this action',
                });
                return;
            }
            next();
        }
        catch (error) {
            logger_1.default.error({ error: error.message }, 'Error in requireRole middleware');
            res.status(500).json({
                success: false,
                message: 'Authorization check failed',
                error: error.message,
            });
        }
    };
};
exports.requireRole = requireRole;
const requirePermission = (...requiredPermissions) => {
    return async (req, res, next) => {
        try {
            if (!req.rbacContext) {
                await (0, exports.loadRBACContext)(req, res, () => { });
                if (!req.rbacContext)
                    return;
            }
            const { userId, organizationId, permissions } = req.rbacContext;
            const hasPermission = requiredPermissions.some(perm => permissions.includes(perm));
            if (!hasPermission) {
                logger_1.default.warn({ userId, permissions, requiredPermissions }, 'Access denied: insufficient permissions');
                res.status(403).json({
                    success: false,
                    message: 'Forbidden',
                    error: `This action requires one of the following permissions: ${requiredPermissions.join(', ')}`,
                    userMessage: 'You do not have permission to perform this action',
                });
                return;
            }
            next();
        }
        catch (error) {
            logger_1.default.error({ error: error.message }, 'Error in requirePermission middleware');
            res.status(500).json({
                success: false,
                message: 'Authorization check failed',
                error: error.message,
            });
        }
    };
};
exports.requirePermission = requirePermission;
const requireAllPermissions = (...requiredPermissions) => {
    return async (req, res, next) => {
        try {
            if (!req.rbacContext) {
                await (0, exports.loadRBACContext)(req, res, () => { });
                if (!req.rbacContext)
                    return;
            }
            const { userId, permissions } = req.rbacContext;
            const hasAllPermissions = requiredPermissions.every(perm => permissions.includes(perm));
            if (!hasAllPermissions) {
                logger_1.default.warn({ userId, permissions, requiredPermissions }, 'Access denied: missing required permissions');
                res.status(403).json({
                    success: false,
                    message: 'Forbidden',
                    error: `This action requires all of the following permissions: ${requiredPermissions.join(', ')}`,
                    userMessage: 'You do not have permission to perform this action',
                });
                return;
            }
            next();
        }
        catch (error) {
            logger_1.default.error({ error: error.message }, 'Error in requireAllPermissions middleware');
            res.status(500).json({
                success: false,
                message: 'Authorization check failed',
                error: error.message,
            });
        }
    };
};
exports.requireAllPermissions = requireAllPermissions;
const attachUserPermissions = (req) => {
    if (!req.rbacContext) {
        throw new Error('RBAC context not loaded');
    }
    const email = req.user?.email || '';
    return {
        id: req.rbacContext.userId,
        email,
        role: req.rbacContext.role,
        permissions: req.rbacContext.permissions,
    };
};
exports.attachUserPermissions = attachUserPermissions;


export {};

// __CJS_EXPORT_BRIDGE__
const __cjs_exports: any = exports as any;
export const attachUserPermissions = __cjs_exports.attachUserPermissions;
export const requireAllPermissions = __cjs_exports.requireAllPermissions;
export const requirePermission = __cjs_exports.requirePermission;
export const requireRole = __cjs_exports.requireRole;
export const loadRBACContext = __cjs_exports.loadRBACContext;
