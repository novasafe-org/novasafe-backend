// @ts-nocheck
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TRIAL_CONFIG = void 0;
exports.getTrialDurationMs = getTrialDurationMs;
exports.getTrialDurationSeconds = getTrialDurationSeconds;
exports.getTrialEndDate = getTrialEndDate;
exports.getTrialDays = getTrialDays;
exports.getTrialDurationLabel = getTrialDurationLabel;
const TRIAL_DAYS = Math.max(0, parseInt(process.env.TRIAL_DAYS || '30', 10));
const TRIAL_MINUTES = process.env.TRIAL_MINUTES ? Math.max(0, parseInt(process.env.TRIAL_MINUTES, 10)) : null;
function getTrialDurationMs() {
    if (TRIAL_MINUTES != null && TRIAL_MINUTES > 0) {
        return TRIAL_MINUTES * 60 * 1000;
    }
    return TRIAL_DAYS * 24 * 60 * 60 * 1000;
}
function getTrialDurationSeconds() {
    return Math.floor(getTrialDurationMs() / 1000);
}
function getTrialEndDate(from) {
    return new Date(from.getTime() + getTrialDurationMs());
}
function getTrialDays() {
    if (TRIAL_MINUTES != null && TRIAL_MINUTES > 0) {
        return TRIAL_MINUTES / (24 * 60);
    }
    return TRIAL_DAYS;
}
function getTrialDurationLabel() {
    if (TRIAL_MINUTES != null && TRIAL_MINUTES > 0) {
        return `${TRIAL_MINUTES} minute${TRIAL_MINUTES === 1 ? '' : 's'}`;
    }
    return `${TRIAL_DAYS} day${TRIAL_DAYS === 1 ? '' : 's'}`;
}
exports.TRIAL_CONFIG = {
    trialDays: TRIAL_DAYS,
    trialMinutes: TRIAL_MINUTES,
    getTrialDurationMs,
    getTrialDurationSeconds,
    getTrialEndDate,
    getTrialDays,
    getTrialDurationLabel,
};


export {};

// __CJS_EXPORT_BRIDGE__
const __cjs_exports: any = exports as any;
export const TRIAL_CONFIG = __cjs_exports.TRIAL_CONFIG;
export const getTrialDurationMs = __cjs_exports.getTrialDurationMs;
export const getTrialDurationSeconds = __cjs_exports.getTrialDurationSeconds;
export const getTrialEndDate = __cjs_exports.getTrialEndDate;
export const getTrialDays = __cjs_exports.getTrialDays;
export const getTrialDurationLabel = __cjs_exports.getTrialDurationLabel;
