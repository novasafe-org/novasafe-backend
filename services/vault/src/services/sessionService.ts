// @ts-nocheck
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupExpiredSessions = exports.revokeAllSessions = exports.revokeSession = exports.updateSessionActivity = exports.getSessionByTokenId = exports.getUserSessions = exports.createSession = void 0;
const mongodb_1 = require("mongodb");
const connection_1 = __importDefault(require("../../database/connection"));
const config_1 = require("../../config/config");
const logger_1 = __importDefault(require("../logger"));
const deviceDetection_1 = require("../utils/deviceDetection");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const collection = config_1.DBCONFIG.vault.collections;
const createSession = async (params) => {
    try {
        const db = new connection_1.default('vault');
        const expiresInDays = params.expiresInDays || 30;
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expiresInDays);
        const refreshTokenHash = bcryptjs_1.default.hashSync(params.refreshToken, 10);
        const deviceType = (0, deviceDetection_1.detectDevice)(params.deviceInfo.userAgent);
        const deviceName = `${params.deviceInfo.browser} on ${params.deviceInfo.os}`;
        const session = {
            userId: new mongodb_1.ObjectId(params.userId),
            tokenId: params.tokenId,
            refreshTokenHash,
            deviceName,
            deviceType,
            deviceInfo: params.deviceInfo,
            lastActivity: new Date(),
            createdAt: new Date(),
            expiresAt,
            revoked: false,
            revokedAt: null,
        };
        const result = await db.insertOne(collection.sessions, session);
        return {
            ...session,
            _id: result.insertedId,
        };
    }
    catch (error) {
        logger_1.default.error(`Error creating session: ${error.message}`);
        throw error;
    }
};
exports.createSession = createSession;
const getUserSessions = async (userId) => {
    try {
        const db = new connection_1.default('vault');
        const sessions = await db.findMany(collection.sessions, {
            userId: new mongodb_1.ObjectId(userId),
            revoked: false,
            expiresAt: { $gt: new Date() },
        });
        if (sessions && sessions.length > 0) {
            sessions.sort((a, b) => {
                const dateA = new Date(a.lastActivity).getTime();
                const dateB = new Date(b.lastActivity).getTime();
                return dateB - dateA;
            });
        }
        return sessions || [];
    }
    catch (error) {
        logger_1.default.error(`Error getting user sessions: ${error.message}`);
        throw error;
    }
};
exports.getUserSessions = getUserSessions;
const getSessionByTokenId = async (tokenId) => {
    try {
        const db = new connection_1.default('vault');
        const session = await db.findOne(collection.sessions, {
            tokenId,
            revoked: false,
            expiresAt: { $gt: new Date() },
        });
        return session;
    }
    catch (error) {
        logger_1.default.error(`Error getting session by token ID: ${error.message}`);
        return null;
    }
};
exports.getSessionByTokenId = getSessionByTokenId;
const updateSessionActivity = async (tokenId) => {
    try {
        const db = new connection_1.default('vault');
        await db.updateOne(collection.sessions, { tokenId, revoked: false }, {
            $set: {
                lastActivity: new Date(),
            },
        });
    }
    catch (error) {
        logger_1.default.error(`Error updating session activity: ${error.message}`);
    }
};
exports.updateSessionActivity = updateSessionActivity;
const revokeSession = async (sessionId, userId) => {
    try {
        const db = new connection_1.default('vault');
        await db.updateOne(collection.sessions, {
            _id: new mongodb_1.ObjectId(sessionId),
            userId: new mongodb_1.ObjectId(userId),
        }, {
            $set: {
                revoked: true,
                revokedAt: new Date(),
            },
        });
        logger_1.default.info(`Session revoked: ${sessionId} for user: ${userId}`);
    }
    catch (error) {
        logger_1.default.error(`Error revoking session: ${error.message}`);
        throw error;
    }
};
exports.revokeSession = revokeSession;
const revokeAllSessions = async (userId, excludeTokenId) => {
    try {
        const db = new connection_1.default('vault');
        const query = {
            userId: new mongodb_1.ObjectId(userId),
            revoked: false,
        };
        if (excludeTokenId) {
            query.tokenId = { $ne: excludeTokenId };
        }
        await db.updateMany(collection.sessions, query, {
            $set: {
                revoked: true,
                revokedAt: new Date(),
            },
        });
        logger_1.default.info(`All sessions revoked for user: ${userId} (excluding: ${excludeTokenId || 'none'})`);
    }
    catch (error) {
        logger_1.default.error(`Error revoking all sessions: ${error.message}`);
        throw error;
    }
};
exports.revokeAllSessions = revokeAllSessions;
const cleanupExpiredSessions = async () => {
    try {
        const db = new connection_1.default('vault');
        const result = await db.deleteMany(collection.sessions, {
            expiresAt: { $lt: new Date() },
        });
        logger_1.default.info(`Cleaned up ${result.deletedCount} expired sessions`);
        return result.deletedCount || 0;
    }
    catch (error) {
        logger_1.default.error(`Error cleaning up expired sessions: ${error.message}`);
        return 0;
    }
};
exports.cleanupExpiredSessions = cleanupExpiredSessions;


export {};

// __CJS_EXPORT_BRIDGE__
const __cjs_exports: any = exports as any;
export const cleanupExpiredSessions = __cjs_exports.cleanupExpiredSessions;
export const revokeAllSessions = __cjs_exports.revokeAllSessions;
export const revokeSession = __cjs_exports.revokeSession;
export const updateSessionActivity = __cjs_exports.updateSessionActivity;
export const getSessionByTokenId = __cjs_exports.getSessionByTokenId;
export const getUserSessions = __cjs_exports.getUserSessions;
export const createSession = __cjs_exports.createSession;
