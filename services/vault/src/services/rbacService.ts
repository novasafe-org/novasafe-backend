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
exports.getOrganizationMembers = exports.upsertMembership = exports.userHasAllPermissions = exports.userHasAnyPermission = exports.userHasPermission = exports.getUserPermissions = exports.getUserRole = void 0;
const mongodb_1 = require("mongodb");
const connection_1 = __importDefault(require("../../database/connection"));
const config_1 = require("../../config/config");
const rbac_constants_1 = require("../constants/rbac.constants");
const logger_1 = __importDefault(require("../logger"));
const collection = config_1.DBCONFIG.vault.collections;
const isObjectIdString = (s) => /^[a-fA-F0-9]{24}$/.test(s);
const getUserRole = async (userId, organizationIdOrWorkspaceId) => {
    try {
        const db = new connection_1.default('vault');
        const byWorkspaceId = isObjectIdString(organizationIdOrWorkspaceId);
        if (byWorkspaceId) {
            const membership = await db.findOne(collection.organizationMembers || 'organizationMembers', {
                userId: new mongodb_1.ObjectId(userId),
                $or: [
                    { workspaceId: new mongodb_1.ObjectId(organizationIdOrWorkspaceId) },
                    { organizationId: organizationIdOrWorkspaceId },
                ],
                status: 'active',
            });
            if (membership?.role)
                return membership.role;
            const { getWorkspaceById } = await Promise.resolve().then(() => __importStar(require('./workspaceService')));
            const workspace = await getWorkspaceById(organizationIdOrWorkspaceId);
            if (workspace && workspace.ownerUserId?.toString() === userId)
                return rbac_constants_1.UserRole.OWNER;
        }
        else {
            const membership = await db.findOne(collection.organizationMembers || 'organizationMembers', {
                userId: new mongodb_1.ObjectId(userId),
                organizationId: organizationIdOrWorkspaceId,
                status: 'active',
            });
            if (membership?.role)
                return membership.role;
            const user = await db.findOne(collection.vaultUsers, {
                _id: new mongodb_1.ObjectId(userId),
                companyName: organizationIdOrWorkspaceId,
            });
            if (user && user.role) {
                const role = (user.role || '').toLowerCase();
                if (['owner', 'admin', 'member', 'viewer'].includes(role))
                    return role;
            }
            if (organizationIdOrWorkspaceId === userId)
                return rbac_constants_1.UserRole.OWNER;
        }
        return rbac_constants_1.UserRole.MEMBER;
    }
    catch (error) {
        logger_1.default.error({ error: error.message, userId, organizationIdOrWorkspaceId }, 'Failed to get user role');
        return rbac_constants_1.UserRole.VIEWER;
    }
};
exports.getUserRole = getUserRole;
const getUserPermissions = async (userId, organizationId) => {
    try {
        const role = await (0, exports.getUserRole)(userId, organizationId);
        return (0, rbac_constants_1.getPermissionsForRole)(role);
    }
    catch (error) {
        logger_1.default.error({ error: error.message, userId, organizationId }, 'Failed to get user permissions');
        return [];
    }
};
exports.getUserPermissions = getUserPermissions;
const userHasPermission = async (userId, organizationId, permission) => {
    try {
        const role = await (0, exports.getUserRole)(userId, organizationId);
        return (0, rbac_constants_1.roleHasPermission)(role, permission);
    }
    catch (error) {
        logger_1.default.error({ error: error.message, userId, organizationId, permission }, 'Failed to check user permission');
        return false;
    }
};
exports.userHasPermission = userHasPermission;
const userHasAnyPermission = async (userId, organizationId, permissions) => {
    try {
        const userPermissions = await (0, exports.getUserPermissions)(userId, organizationId);
        return permissions.some(perm => userPermissions.includes(perm));
    }
    catch (error) {
        logger_1.default.error({ error: error.message, userId, organizationId }, 'Failed to check user permissions');
        return false;
    }
};
exports.userHasAnyPermission = userHasAnyPermission;
const userHasAllPermissions = async (userId, organizationId, permissions) => {
    try {
        const userPermissions = await (0, exports.getUserPermissions)(userId, organizationId);
        return permissions.every(perm => userPermissions.includes(perm));
    }
    catch (error) {
        logger_1.default.error({ error: error.message, userId, organizationId }, 'Failed to check user permissions');
        return false;
    }
};
exports.userHasAllPermissions = userHasAllPermissions;
const upsertMembership = async (userId, organizationIdOrWorkspaceId, role, status = 'active', forceWorkspaceId = false, displayName) => {
    try {
        const db = new connection_1.default('vault');
        const useWorkspaceId = forceWorkspaceId || isObjectIdString(organizationIdOrWorkspaceId);
        const membershipData = {
            userId: new mongodb_1.ObjectId(userId),
            organizationId: organizationIdOrWorkspaceId,
            role,
            status,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        if (useWorkspaceId) {
            membershipData.workspaceId = new mongodb_1.ObjectId(organizationIdOrWorkspaceId);
        }
        const displayNameTrimmed = displayName != null ? String(displayName).trim() : '';
        if (displayNameTrimmed !== '') {
            membershipData.displayName = displayNameTrimmed;
        }
        const query = {
            userId: new mongodb_1.ObjectId(userId),
            ...(useWorkspaceId
                ? { $or: [{ workspaceId: new mongodb_1.ObjectId(organizationIdOrWorkspaceId) }, { organizationId: organizationIdOrWorkspaceId }] }
                : { organizationId: organizationIdOrWorkspaceId }),
        };
        const existing = await db.findOne(collection.organizationMembers || 'organizationMembers', query);
        if (existing) {
            const updateSet = {
                role,
                status,
                updatedAt: new Date(),
                ...(useWorkspaceId ? { workspaceId: new mongodb_1.ObjectId(organizationIdOrWorkspaceId), organizationId: organizationIdOrWorkspaceId } : {}),
            };
            if (displayNameTrimmed !== '') {
                updateSet.displayName = displayNameTrimmed;
            }
            await db.updateOne(collection.organizationMembers || 'organizationMembers', { _id: existing._id }, { $set: updateSet });
            logger_1.default.info({ membershipId: existing._id, displayName: displayNameTrimmed || '(unchanged)' }, 'Membership updated with workspace display name');
            return { ...existing, ...membershipData, _id: existing._id };
        }
        const result = await db.insertOne(collection.organizationMembers || 'organizationMembers', membershipData);
        logger_1.default.info({ membershipId: result.insertedId, displayName: displayNameTrimmed || '(none)' }, 'Membership created with workspace display name');
        return { ...membershipData, _id: result.insertedId };
    }
    catch (error) {
        logger_1.default.error({ error: error.message, userId, organizationIdOrWorkspaceId, role }, 'Failed to upsert membership');
        throw error;
    }
};
exports.upsertMembership = upsertMembership;
const getOrganizationMembers = async (organizationIdOrWorkspaceId) => {
    try {
        const db = new connection_1.default('vault');
        const isWsId = isObjectIdString(organizationIdOrWorkspaceId);
        const filter = {
            status: 'active',
            ...(isWsId
                ? { $or: [{ workspaceId: new mongodb_1.ObjectId(organizationIdOrWorkspaceId) }, { organizationId: organizationIdOrWorkspaceId }] }
                : { organizationId: organizationIdOrWorkspaceId }),
        };
        const members = await db.getDb()
            .collection(collection.organizationMembers || 'organizationMembers')
            .find(filter)
            .toArray();
        return members;
    }
    catch (error) {
        logger_1.default.error({ error: error.message, organizationIdOrWorkspaceId }, 'Failed to get organization members');
        return [];
    }
};
exports.getOrganizationMembers = getOrganizationMembers;


export {};

// __CJS_EXPORT_BRIDGE__
const __cjs_exports: any = exports as any;
export const getOrganizationMembers = __cjs_exports.getOrganizationMembers;
export const upsertMembership = __cjs_exports.upsertMembership;
export const userHasAllPermissions = __cjs_exports.userHasAllPermissions;
export const userHasAnyPermission = __cjs_exports.userHasAnyPermission;
export const userHasPermission = __cjs_exports.userHasPermission;
export const getUserPermissions = __cjs_exports.getUserPermissions;
export const getUserRole = __cjs_exports.getUserRole;
