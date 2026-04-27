// @ts-nocheck
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClientIP = exports.parseOS = exports.parseBrowser = exports.detectDevice = void 0;
const detectDevice = (userAgent) => {
    const ua = userAgent.toLowerCase();
    if (ua.includes('tablet') || ua.includes('ipad') || (ua.includes('android') && !ua.includes('mobile'))) {
        return 'tablet';
    }
    if (ua.includes('mobile') ||
        ua.includes('android') ||
        ua.includes('iphone') ||
        ua.includes('ipod') ||
        ua.includes('blackberry') ||
        ua.includes('windows phone')) {
        return 'mobile';
    }
    return 'desktop';
};
exports.detectDevice = detectDevice;
const parseBrowser = (userAgent) => {
    const ua = userAgent.toLowerCase();
    if (ua.includes('edg')) {
        const match = userAgent.match(/Edg\/(\d+)/i);
        return match ? `Edge ${match[1]}` : 'Edge';
    }
    if (ua.includes('chrome') && !ua.includes('edg')) {
        const match = userAgent.match(/Chrome\/(\d+)/i);
        return match ? `Chrome ${match[1]}` : 'Chrome';
    }
    if (ua.includes('firefox')) {
        const match = userAgent.match(/Firefox\/(\d+)/i);
        return match ? `Firefox ${match[1]}` : 'Firefox';
    }
    if (ua.includes('safari') && !ua.includes('chrome')) {
        const match = userAgent.match(/Version\/(\d+)/i) || userAgent.match(/Safari\/(\d+)/i);
        return match ? `Safari ${match[1]}` : 'Safari';
    }
    if (ua.includes('opera') || ua.includes('opr')) {
        const match = userAgent.match(/OPR\/(\d+)/i) || userAgent.match(/Opera\/(\d+)/i);
        return match ? `Opera ${match[1]}` : 'Opera';
    }
    return 'Unknown Browser';
};
exports.parseBrowser = parseBrowser;
const parseOS = (userAgent) => {
    const ua = userAgent.toLowerCase();
    if (ua.includes('windows nt 10'))
        return 'Windows 10/11';
    if (ua.includes('windows nt 6.3'))
        return 'Windows 8.1';
    if (ua.includes('windows nt 6.2'))
        return 'Windows 8';
    if (ua.includes('windows nt 6.1'))
        return 'Windows 7';
    if (ua.includes('windows nt'))
        return 'Windows';
    if (ua.includes('mac os x')) {
        const match = userAgent.match(/Mac OS X (\d+[._]\d+)/i);
        if (match) {
            const version = match[1].replace('_', '.');
            return `macOS ${version}`;
        }
        return 'macOS';
    }
    if (ua.includes('iphone')) {
        const match = userAgent.match(/OS (\d+[._]\d+)/i);
        if (match) {
            const version = match[1].replace('_', '.');
            return `iOS ${version}`;
        }
        return 'iOS';
    }
    if (ua.includes('android')) {
        const match = userAgent.match(/Android (\d+[._]\d+)/i);
        if (match) {
            return `Android ${match[1]}`;
        }
        return 'Android';
    }
    if (ua.includes('linux'))
        return 'Linux';
    if (ua.includes('ubuntu'))
        return 'Ubuntu';
    return 'Unknown OS';
};
exports.parseOS = parseOS;
const getClientIP = (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0].trim();
    }
    const realIP = req.headers['x-real-ip'];
    if (realIP) {
        return Array.isArray(realIP) ? realIP[0] : realIP;
    }
    return req.ip || req.connection?.remoteAddress || 'Unknown';
};
exports.getClientIP = getClientIP;


export {};

// __CJS_EXPORT_BRIDGE__
const __cjs_exports: any = exports as any;
export const getClientIP = __cjs_exports.getClientIP;
export const parseOS = __cjs_exports.parseOS;
export const parseBrowser = __cjs_exports.parseBrowser;
export const detectDevice = __cjs_exports.detectDevice;
