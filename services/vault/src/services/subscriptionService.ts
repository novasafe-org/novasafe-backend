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
exports.checkExpiredSubscriptions = exports.renewSubscription = exports.cancelSubscription = exports.updateSubscription = exports.getSubscriptionById = exports.getUserSubscription = exports.hasActiveSubscriptionAccess = exports.getSubscriptionByWorkspaceIdAnyStatus = exports.getSubscriptionByWorkspaceId = exports.createSubscription = void 0;
const mongodb_1 = require("mongodb");
const connection_1 = __importDefault(require("../../database/connection"));
const config_1 = require("../../config/config");
const logger_1 = __importDefault(require("../logger"));
const collection = config_1.DBCONFIG.vault.collections;
const createSubscription = async (params) => {
    try {
        const db = new connection_1.default('vault');
        const now = new Date();
        let currentPeriodStart = now;
        let currentPeriodEnd = new Date(now);
        let trialStart = null;
        let trialEnd = null;
        const explicitTrialEnd = params.trialEndDate;
        const trialDaysParam = params.trialDays ?? 0;
        const trialEndResolved = explicitTrialEnd
            ? explicitTrialEnd
            : trialDaysParam > 0
                ? (() => {
                    const e = new Date(now);
                    e.setDate(e.getDate() + trialDaysParam);
                    return e;
                })()
                : null;
        if (trialEndResolved) {
            trialStart = now;
            trialEnd = trialEndResolved;
            currentPeriodEnd = new Date(trialEndResolved);
        }
        else {
            if (params.billingPeriod === 'monthly') {
                currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
            }
            else if (params.billingPeriod === 'yearly') {
                currentPeriodEnd.setFullYear(currentPeriodEnd.getFullYear() + 1);
            }
            else {
                currentPeriodEnd.setFullYear(currentPeriodEnd.getFullYear() + 1);
            }
        }
        let status = 'active';
        if (trialEndResolved) {
            status = 'trialing';
        }
        const subscription = {
            userId: new mongodb_1.ObjectId(params.userId),
            planId: params.planId,
            status,
            billingPeriod: params.billingPeriod,
            currentPeriodStart,
            currentPeriodEnd,
            trialStart,
            trialEnd,
            cancelAtPeriodEnd: false,
            canceledAt: null,
            expiresAt: null,
            isGrandfathered: params.isGrandfathered || false,
            grandfatheredPlanId: params.grandfatheredPlanId || null,
            lastPaymentOrderId: params.paymentOrderId ? new mongodb_1.ObjectId(params.paymentOrderId) : null,
            initialPaymentOrderId: params.paymentOrderId ? new mongodb_1.ObjectId(params.paymentOrderId) : null,
            provider: params.provider || null,
            providerSubscriptionId: params.providerSubscriptionId || null,
            providerCustomerId: params.providerCustomerId || null,
            providerCustomerToken: params.providerCustomerToken || null,
            paymentMethodAdded: params.paymentMethodAdded || false,
            payuSubscriptionId: params.payuSubscriptionId || null,
            payuCustomerToken: params.payuCustomerToken || null,
            createdAt: now,
            updatedAt: now,
        };
        if (params.workspaceId)
            subscription.workspaceId = new mongodb_1.ObjectId(params.workspaceId);
        const result = await db.insertOne(collection.subscriptions, subscription);
        logger_1.default.info(`Created subscription for user ${params.userId}, plan: ${params.planId}`);
        return {
            ...subscription,
            _id: result.insertedId,
        };
    }
    catch (error) {
        logger_1.default.error(error, 'Error creating subscription');
        throw error;
    }
};
exports.createSubscription = createSubscription;
const getSubscriptionByWorkspaceId = async (workspaceId) => {
    try {
        const db = new connection_1.default('vault');
        const subscription = await db.findOne(collection.subscriptions, {
            workspaceId: new mongodb_1.ObjectId(workspaceId),
            status: { $in: ['active', 'trialing'] },
        });
        return subscription;
    }
    catch (error) {
        logger_1.default.error(error, 'Error fetching workspace subscription');
        throw error;
    }
};
exports.getSubscriptionByWorkspaceId = getSubscriptionByWorkspaceId;
const getSubscriptionByWorkspaceIdAnyStatus = async (workspaceId) => {
    try {
        const db = new connection_1.default('vault');
        const subscription = await db.findOne(collection.subscriptions, {
            workspaceId: new mongodb_1.ObjectId(workspaceId),
        });
        return subscription;
    }
    catch (error) {
        logger_1.default.error(error, 'Error fetching workspace subscription (any status)');
        throw error;
    }
};
exports.getSubscriptionByWorkspaceIdAnyStatus = getSubscriptionByWorkspaceIdAnyStatus;
const hasActiveSubscriptionAccess = async (workspaceId) => {
    const subscription = await (0, exports.getSubscriptionByWorkspaceId)(workspaceId);
    if (!subscription)
        return false;
    if (subscription.status === 'active')
        return true;
    if (subscription.status === 'trialing') {
        const trialEnd = subscription.trialEnd || subscription.trialEndsAt;
        if (!trialEnd)
            return true;
        return new Date(trialEnd) >= new Date();
    }
    return false;
};
exports.hasActiveSubscriptionAccess = hasActiveSubscriptionAccess;
const getUserSubscription = async (userId) => {
    try {
        const { getDefaultWorkspaceIdForUser } = await Promise.resolve().then(() => __importStar(require('./workspaceService')));
        const workspaceId = await getDefaultWorkspaceIdForUser(userId.toString());
        const byWorkspace = await (0, exports.getSubscriptionByWorkspaceId)(workspaceId);
        if (byWorkspace)
            return byWorkspace;
        const db = new connection_1.default('vault');
        const subscription = await db.findOne(collection.subscriptions, {
            userId: new mongodb_1.ObjectId(userId),
            status: { $in: ['active', 'trialing'] },
        });
        return subscription;
    }
    catch (error) {
        logger_1.default.error(error, 'Error fetching user subscription');
        throw error;
    }
};
exports.getUserSubscription = getUserSubscription;
const getSubscriptionById = async (subscriptionId) => {
    try {
        const db = new connection_1.default('vault');
        const subscription = await db.findOne(collection.subscriptions, {
            _id: new mongodb_1.ObjectId(subscriptionId),
        });
        return subscription;
    }
    catch (error) {
        logger_1.default.error(error, 'Error fetching subscription');
        throw error;
    }
};
exports.getSubscriptionById = getSubscriptionById;
const updateSubscription = async (subscriptionId, updates) => {
    try {
        const db = new connection_1.default('vault');
        const updateData = {
            ...updates,
            updatedAt: new Date(),
        };
        const result = await db.updateOne(collection.subscriptions, { _id: new mongodb_1.ObjectId(subscriptionId) }, { $set: updateData });
        if (result.modifiedCount === 0) {
            return null;
        }
        return await (0, exports.getSubscriptionById)(subscriptionId);
    }
    catch (error) {
        logger_1.default.error(error, 'Error updating subscription');
        throw error;
    }
};
exports.updateSubscription = updateSubscription;
const cancelSubscription = async (subscriptionId, cancelImmediately = false) => {
    try {
        const subscription = await (0, exports.getSubscriptionById)(subscriptionId);
        if (!subscription) {
            throw new Error('Subscription not found');
        }
        const updates = {
            cancelAtPeriodEnd: !cancelImmediately,
        };
        if (cancelImmediately) {
            updates.status = 'canceled';
            updates.canceledAt = new Date();
            updates.expiresAt = new Date();
        }
        return await (0, exports.updateSubscription)(subscriptionId, updates);
    }
    catch (error) {
        logger_1.default.error(error, 'Error canceling subscription');
        throw error;
    }
};
exports.cancelSubscription = cancelSubscription;
const renewSubscription = async (subscriptionId, paymentOrderId) => {
    try {
        const subscription = await (0, exports.getSubscriptionById)(subscriptionId);
        if (!subscription) {
            throw new Error('Subscription not found');
        }
        const now = new Date();
        let newPeriodEnd = new Date(subscription.currentPeriodEnd);
        if (subscription.billingPeriod === 'monthly') {
            newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);
        }
        else if (subscription.billingPeriod === 'yearly') {
            newPeriodEnd.setFullYear(newPeriodEnd.getFullYear() + 1);
        }
        const updates = {
            status: 'active',
            currentPeriodStart: now,
            currentPeriodEnd: newPeriodEnd,
            cancelAtPeriodEnd: false,
            canceledAt: null,
        };
        await new connection_1.default('vault').updateOne(collection.subscriptions, { _id: new mongodb_1.ObjectId(subscriptionId) }, {
            $set: {
                ...updates,
                lastPaymentOrderId: new mongodb_1.ObjectId(paymentOrderId),
                updatedAt: new Date(),
            },
        });
        return await (0, exports.getSubscriptionById)(subscriptionId);
    }
    catch (error) {
        logger_1.default.error(error, 'Error renewing subscription');
        throw error;
    }
};
exports.renewSubscription = renewSubscription;
const checkExpiredSubscriptions = async () => {
    try {
        const db = new connection_1.default('vault');
        const now = new Date();
        const result = await db.updateMany(collection.subscriptions, {
            status: { $in: ['active', 'trialing', 'past_due'] },
            $or: [
                { currentPeriodEnd: { $lt: now } },
                { expiresAt: { $lt: now } },
                { trialEnd: { $lt: now } },
                { trialEndsAt: { $lt: now } },
            ],
        }, {
            $set: {
                status: 'expired',
                updatedAt: now,
            },
        });
        logger_1.default.info(`Updated ${result.modifiedCount} expired subscriptions`);
        return result.modifiedCount || 0;
    }
    catch (error) {
        logger_1.default.error(error, 'Error checking expired subscriptions');
        return 0;
    }
};
exports.checkExpiredSubscriptions = checkExpiredSubscriptions;


export {};

// __CJS_EXPORT_BRIDGE__
const __cjs_exports: any = exports as any;
export const checkExpiredSubscriptions = __cjs_exports.checkExpiredSubscriptions;
export const renewSubscription = __cjs_exports.renewSubscription;
export const cancelSubscription = __cjs_exports.cancelSubscription;
export const updateSubscription = __cjs_exports.updateSubscription;
export const getSubscriptionById = __cjs_exports.getSubscriptionById;
export const getUserSubscription = __cjs_exports.getUserSubscription;
export const hasActiveSubscriptionAccess = __cjs_exports.hasActiveSubscriptionAccess;
export const getSubscriptionByWorkspaceIdAnyStatus = __cjs_exports.getSubscriptionByWorkspaceIdAnyStatus;
export const getSubscriptionByWorkspaceId = __cjs_exports.getSubscriptionByWorkspaceId;
export const createSubscription = __cjs_exports.createSubscription;
