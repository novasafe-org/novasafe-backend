// @ts-nocheck
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activityLogService = void 0;
const mongodb_1 = require("mongodb");
const connection_1 = __importDefault(require("../../database/connection"));
const config_1 = require("../../config/config");
const activityLog_constants_1 = require("../constants/activityLog.constants");
const logger_1 = __importDefault(require("../logger"));
const collection = config_1.DBCONFIG.vault.collections;
class ActivityLogService {
    constructor() {
        this.db = new connection_1.default('vault');
    }
    async logEvent(params) {
        try {
            const severity = params.severity || activityLog_constants_1.ACTION_SEVERITY_MAP[params.action] || 'info';
            const actorRole = params.actorRole || 'member';
            const logEntry = {
                organizationId: params.organizationId,
                actorUserId: params.actorUserId ? new mongodb_1.ObjectId(params.actorUserId) : null,
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
                createdAt: new Date(),
            };
            await this.db.insertOne(collection.auditLogs, logEntry);
            if (process.env.NODE_ENV === 'development') {
                logger_1.default.debug({
                    action: params.action,
                    organizationId: params.organizationId,
                    actorEmail: params.actorEmail,
                }, 'Activity log created');
            }
        }
        catch (error) {
            logger_1.default.error({
                error: error.message,
                action: params.action,
                organizationId: params.organizationId,
            }, 'Failed to create activity log');
        }
    }
    async getLogs(organizationId, filters = {}, pagination = {}) {
        try {
            const page = pagination.page || 1;
            const limit = Math.min(pagination.limit || 50, 500);
            const skip = (page - 1) * limit;
            const query = {
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
                }
                else {
                    query.action = filters.action;
                }
            }
            if (filters.actorUserId) {
                query.actorUserId = new mongodb_1.ObjectId(filters.actorUserId);
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
                }
                else {
                    query.severity = filters.severity;
                }
            }
            if (filters.search) {
                query.description = { $regex: filters.search, $options: 'i' };
            }
            const db = this.db.getDb();
            const total = await db.collection(collection.auditLogs).countDocuments(query);
            const logs = await db
                .collection(collection.auditLogs)
                .find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .toArray();
            return {
                logs: logs,
                pagination: {
                    page,
                    limit,
                    total,
                    hasMore: skip + logs.length < total,
                },
            };
        }
        catch (error) {
            logger_1.default.error(error, 'Error fetching activity logs');
            throw new Error(`Failed to fetch activity logs: ${error.message}`);
        }
    }
    async getLogById(logId, organizationId) {
        try {
            if (!mongodb_1.ObjectId.isValid(logId)) {
                logger_1.default.warn(`Invalid log ID format: ${logId}`);
                return null;
            }
            const log = await this.db.findOne(collection.auditLogs, {
                _id: new mongodb_1.ObjectId(logId),
                organizationId,
            });
            return log;
        }
        catch (error) {
            logger_1.default.error(error, 'Error fetching activity log by ID');
            throw new Error(`Failed to fetch activity log: ${error.message}`);
        }
    }
    async exportLogs(organizationId, filters = {}, format = 'json') {
        try {
            const query = {
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
                }
                else {
                    query.action = filters.action;
                }
            }
            if (filters.actorUserId) {
                query.actorUserId = new mongodb_1.ObjectId(filters.actorUserId);
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
                }
                else {
                    query.severity = filters.severity;
                }
            }
            if (filters.search) {
                query.description = { $regex: filters.search, $options: 'i' };
            }
            const db = this.db.getDb();
            const logs = await db
                .collection(collection.auditLogs)
                .find(query)
                .sort({ createdAt: -1 })
                .toArray();
            if (format === 'csv') {
                return this.convertToCSV(logs);
            }
            else {
                return JSON.stringify(logs, null, 2);
            }
        }
        catch (error) {
            logger_1.default.error(error, 'Error exporting activity logs');
            throw new Error(`Failed to export activity logs: ${error.message}`);
        }
    }
    convertToCSV(logs) {
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
exports.activityLogService = new ActivityLogService();
exports.default = ActivityLogService;


export {};

// __CJS_EXPORT_BRIDGE__
const __cjs_exports: any = exports as any;
export default __cjs_exports.default;
export const activityLogService = __cjs_exports.activityLogService;
export type CreateActivityLogParams = Record<string, any>;
