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
exports.ensureUserHasWorkspace = exports.getDefaultWorkspaceIdForUser = exports.getWorkspaceIdsForUser = exports.userBelongsToWorkspace = exports.getWorkspaceById = exports.createWorkspace = void 0;
const mongodb_1 = require("mongodb");
const connection_1 = __importDefault(require("../../database/connection"));
const config_1 = require("../../config/config");
const rbac_constants_1 = require("../constants/rbac.constants");
const logger_1 = __importDefault(require("../logger"));
const collection = config_1.DBCONFIG.vault.collections;
const createWorkspace = async (params) => {
    const db = new connection_1.default('vault');
    const now = new Date();
    const workspace = {
        name: params.name,
        type: params.type,
        ownerUserId: new mongodb_1.ObjectId(params.ownerUserId),
        createdAt: now,
        updatedAt: now,
    };
    const result = await db.insertOne(collection.workspaces || 'workspaces', workspace);
    logger_1.default.info({ workspaceId: result.insertedId, ownerUserId: params.ownerUserId, type: params.type }, 'Workspace created');
    return { ...workspace, _id: result.insertedId };
};
exports.createWorkspace = createWorkspace;
const getWorkspaceById = async (workspaceId) => {
    const db = new connection_1.default('vault');
    const ws = await db.findOne(collection.workspaces || 'workspaces', {
        _id: new mongodb_1.ObjectId(workspaceId),
    });
    return ws;
};
exports.getWorkspaceById = getWorkspaceById;
const userBelongsToWorkspace = async (userId, workspaceId) => {
    if (!workspaceId || !userId)
        return false;
    const db = new connection_1.default('vault');
    const wsId = new mongodb_1.ObjectId(workspaceId);
    const membership = await db.findOne(collection.organizationMembers || 'organizationMembers', {
        userId: new mongodb_1.ObjectId(userId),
        status: 'active',
        $or: [{ workspaceId: wsId }, { organizationId: workspaceId }],
    });
    if (membership)
        return true;
    const workspace = await (0, exports.getWorkspaceById)(workspaceId);
    if (workspace && workspace.ownerUserId?.toString() === userId)
        return true;
    return false;
};
exports.userBelongsToWorkspace = userBelongsToWorkspace;
const isObjectIdString = (s) => /^[a-fA-F0-9]{24}$/.test(s);
const getWorkspaceIdsForUser = async (userId) => {
    const db = new connection_1.default('vault');
    const memberships = await db.findMany(collection.organizationMembers || 'organizationMembers', {
        userId: new mongodb_1.ObjectId(userId),
        status: 'active',
    });
    const ids = [];
    for (const m of memberships) {
        let wid = null;
        const rawWid = m.workspaceId;
        if (rawWid) {
            wid = rawWid.toString?.() ?? rawWid;
        }
        else {
            const orgId = m.organizationId;
            if (orgId && isObjectIdString(orgId))
                wid = orgId;
            else if (orgId)
                wid = orgId;
        }
        if (wid && !ids.includes(wid)) {
            const ws = await (0, exports.getWorkspaceById)(wid).catch(() => null);
            if (ws?.type === 'individual' && ws.ownerUserId?.toString() !== userId) {
                continue;
            }
            ids.push(wid);
        }
    }
    return ids;
};
exports.getWorkspaceIdsForUser = getWorkspaceIdsForUser;
const getDefaultWorkspaceIdForUser = async (userId) => {
    const db = new connection_1.default('vault');
    const memberships = await db.findMany(collection.organizationMembers || 'organizationMembers', {
        userId: new mongodb_1.ObjectId(userId),
        status: 'active',
    });
    for (const m of memberships) {
        let wid = null;
        const rawWid = m.workspaceId;
        if (rawWid) {
            wid = rawWid.toString?.() ?? rawWid;
        }
        else {
            const orgId = m.organizationId;
            if (orgId)
                wid = isObjectIdString(orgId) ? orgId : orgId;
        }
        if (!wid)
            continue;
        const ws = await (0, exports.getWorkspaceById)(wid).catch(() => null);
        if (ws?.type === 'individual' && ws.ownerUserId?.toString() !== userId)
            continue;
        if (ws)
            return ws._id.toString();
        return wid;
    }
    return (0, exports.ensureUserHasWorkspace)(userId);
};
exports.getDefaultWorkspaceIdForUser = getDefaultWorkspaceIdForUser;
const ensureUserHasWorkspace = async (userId) => {
    const db = new connection_1.default('vault');
    const user = await db.findOne(collection.vaultUsers, { _id: new mongodb_1.ObjectId(userId) });
    if (!user)
        throw new Error('User not found');
    const planId = (user.planId || 'individual').toLowerCase();
    const type = (['individual', 'family', 'team', 'business'].includes(planId) ? planId : 'individual');
    const name = user.companyName || 'Personal';
    const workspace = await (0, exports.createWorkspace)({
        name,
        type,
        ownerUserId: userId,
    });
    const { upsertMembership } = await Promise.resolve().then(() => __importStar(require('./rbacService')));
    await upsertMembership(userId, workspace._id.toString(), rbac_constants_1.UserRole.OWNER, 'active', true);
    logger_1.default.info({ userId, workspaceId: workspace._id, type }, 'Lazy migration: workspace and membership created');
    return workspace._id.toString();
};
exports.ensureUserHasWorkspace = ensureUserHasWorkspace;


export {};

// __CJS_EXPORT_BRIDGE__
const __cjs_exports: any = exports as any;
export const ensureUserHasWorkspace = __cjs_exports.ensureUserHasWorkspace;
export const getDefaultWorkspaceIdForUser = __cjs_exports.getDefaultWorkspaceIdForUser;
export const getWorkspaceIdsForUser = __cjs_exports.getWorkspaceIdsForUser;
export const userBelongsToWorkspace = __cjs_exports.userBelongsToWorkspace;
export const getWorkspaceById = __cjs_exports.getWorkspaceById;
export const createWorkspace = __cjs_exports.createWorkspace;
