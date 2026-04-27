// @ts-nocheck
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClientIp = getClientIp;
exports.getUserAgent = getUserAgent;
exports.getLocationFromIp = getLocationFromIp;
function getClientIp(req) {
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
        const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
        return ips.split(',')[0].trim();
    }
    const realIp = req.headers['x-real-ip'];
    if (realIp) {
        return Array.isArray(realIp) ? realIp[0] : realIp;
    }
    const cfConnectingIp = req.headers['cf-connecting-ip'];
    if (cfConnectingIp) {
        return Array.isArray(cfConnectingIp) ? cfConnectingIp[0] : cfConnectingIp;
    }
    return req.socket.remoteAddress || null;
}
function getUserAgent(req) {
    return req.headers['user-agent'] || null;
}
function getLocationFromIp(ip) {
    return null;
}


export {};

// __CJS_EXPORT_BRIDGE__
const __cjs_exports: any = exports as any;
export const getClientIp = __cjs_exports.getClientIp;
export const getUserAgent = __cjs_exports.getUserAgent;
export const getLocationFromIp = __cjs_exports.getLocationFromIp;
