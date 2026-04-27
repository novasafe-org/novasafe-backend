// @ts-nocheck
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logActivity = logActivity;
exports.logSystemActivity = logSystemActivity;
const activityLogService_1 = require("../services/activityLogService");
const requestUtils_1 = require("./requestUtils");
async function logActivity(req, user, params) {
    const planId = (user?.planId || 'individual').toLowerCase();
    if (planId !== 'team' && planId !== 'business') {
        return;
    }
    if (!user?.companyName) {
        return;
    }
    const ipAddress = (0, requestUtils_1.getClientIp)(req);
    const userAgent = (0, requestUtils_1.getUserAgent)(req);
    const location = (0, requestUtils_1.getLocationFromIp)(ipAddress);
    const userRole = (user.role || 'member').toLowerCase();
    const actorRole = userRole === 'admin' || userRole === 'super-admin' ? 'admin' : 'member';
    await activityLogService_1.activityLogService.logEvent({
        organizationId: user.companyName,
        actorUserId: user._id?.toString() || null,
        actorEmail: user.email || null,
        actorRole,
        ipAddress,
        userAgent,
        location,
        ...params,
    });
}
async function logSystemActivity(req, organizationId, params) {
    const ipAddress = (0, requestUtils_1.getClientIp)(req);
    const userAgent = (0, requestUtils_1.getUserAgent)(req);
    const location = (0, requestUtils_1.getLocationFromIp)(ipAddress);
    await activityLogService_1.activityLogService.logEvent({
        organizationId,
        actorUserId: null,
        actorEmail: null,
        actorRole: 'system',
        ipAddress,
        userAgent,
        location,
        ...params,
    });
}


export {};

// __CJS_EXPORT_BRIDGE__
const __cjs_exports: any = exports as any;
export const logActivity = __cjs_exports.logActivity;
export const logSystemActivity = __cjs_exports.logSystemActivity;
