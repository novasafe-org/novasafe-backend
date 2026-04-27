// @ts-nocheck
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireActiveSubscription = void 0;
const subscriptionService_1 = require("../services/subscriptionService");
const logger_1 = __importDefault(require("../logger"));
const isObjectIdString = (s) => /^[a-fA-F0-9]{24}$/.test(s);
const requireActiveSubscription = async (req, res, next) => {
    try {
        if (!req.rbacContext?.organizationId) {
            res.status(403).json({
                success: false,
                message: 'Forbidden',
                error: 'Workspace context required',
                code: 'WORKSPACE_REQUIRED',
            });
            return;
        }
        const workspaceId = req.rbacContext.organizationId;
        if (!isObjectIdString(workspaceId)) {
            next();
            return;
        }
        const hasAccess = await (0, subscriptionService_1.hasActiveSubscriptionAccess)(workspaceId);
        if (hasAccess) {
            next();
            return;
        }
        const subscription = await (0, subscriptionService_1.getSubscriptionByWorkspaceIdAnyStatus)(workspaceId);
        const trialEnd = subscription?.trialEnd || subscription?.trialEndsAt;
        const now = new Date();
        const code = subscription?.status === 'trialing' && trialEnd && new Date(trialEnd) < now
            ? 'TRIAL_EXPIRED'
            : 'SUBSCRIPTION_REQUIRED';
        logger_1.default.warn({ userId: req.user?.id, workspaceId, code, status: subscription?.status }, 'Access denied: subscription or trial required');
        res.status(402).json({
            success: false,
            message: 'Subscription or trial required',
            error: code === 'TRIAL_EXPIRED'
                ? 'Your trial has ended. Please upgrade to continue.'
                : 'Active subscription required.',
            code,
            userMessage: code === 'TRIAL_EXPIRED'
                ? 'Your free trial has ended. Upgrade now to keep using NovaSafe.'
                : 'Please subscribe to access this feature.',
        });
    }
    catch (error) {
        logger_1.default.error({ error: error.message }, 'Subscription middleware error');
        res.status(500).json({
            success: false,
            message: 'Access check failed',
            error: error.message,
        });
    }
};
exports.requireActiveSubscription = requireActiveSubscription;


export {};

// __CJS_EXPORT_BRIDGE__
const __cjs_exports: any = exports as any;
export const requireActiveSubscription = __cjs_exports.requireActiveSubscription;
