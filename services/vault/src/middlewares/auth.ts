// @ts-nocheck
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = void 0;
const generateToken_1 = require("../utils/generateToken");
const sessionService_1 = require("../services/sessionService");
const authMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            res.status(401).json({
                message: 'Authentication required',
                error: 'No authorization header provided'
            });
            return;
        }
        if (!authHeader.startsWith('Bearer ')) {
            res.status(401).json({
                message: 'Invalid authorization format',
                error: 'Authorization header must be in format: Bearer <token>'
            });
            return;
        }
        const token = authHeader.substring(7);
        if (!token) {
            res.status(401).json({
                message: 'Authentication required',
                error: 'No token provided'
            });
            return;
        }
        const decoded = (0, generateToken_1.verifyToken)(token);
        const isPreAuthToken = decoded.preAuth === true;
        const is2FAVerifyRoute = req.path.includes('/2fa/verify') || req.originalUrl.includes('/2fa/verify');
        if (isPreAuthToken && !is2FAVerifyRoute) {
            res.status(403).json({
                message: 'Pre-authentication token',
                error: 'This token requires 2FA verification. Please complete 2FA verification first.',
                code: 'PRE_AUTH_TOKEN_REQUIRES_2FA'
            });
            return;
        }
        if (decoded.jti && !isPreAuthToken) {
            const session = await (0, sessionService_1.getSessionByTokenId)(decoded.jti);
            if (!session || session.revoked) {
                res.status(401).json({
                    message: 'Session revoked',
                    error: 'Your session has been revoked. Please log in again.',
                    code: 'SESSION_REVOKED'
                });
                return;
            }
            if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
                res.status(401).json({
                    message: 'Session expired',
                    error: 'Your session has expired. Please log in again.',
                    code: 'SESSION_EXPIRED'
                });
                return;
            }
            (0, sessionService_1.updateSessionActivity)(decoded.jti).catch(() => {
            });
        }
        req.user = decoded;
        req.tokenId = decoded.jti;
        req.isPreAuthToken = isPreAuthToken;
        next();
    }
    catch (error) {
        res.status(401).json({
            message: 'Invalid or expired token',
            error: error.message
        });
    }
};
exports.authMiddleware = authMiddleware;


export {};

// __CJS_EXPORT_BRIDGE__
const __cjs_exports: any = exports as any;
export const authMiddleware = __cjs_exports.authMiddleware;
