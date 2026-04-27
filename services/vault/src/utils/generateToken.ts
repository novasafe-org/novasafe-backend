// @ts-nocheck
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyToken = exports.generateToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const generateToken = (user, tokenId, isPreAuth) => {
    if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET environment variable is not configured');
    }
    const jti = tokenId || crypto_1.default.randomBytes(16).toString('hex');
    const payload = {
        id: user._id?.toString() || user.googleId || '',
        email: user.email,
        name: user.name,
        picture: user.picture,
        preAuth: isPreAuth || false,
    };
    const token = jsonwebtoken_1.default.sign(payload, process.env.JWT_SECRET, {
        expiresIn: isPreAuth ? '10m' : '7d',
        issuer: 'vault-backend',
        audience: 'vault-frontend',
        jwtid: jti,
    });
    return { token, tokenId: jti };
};
exports.generateToken = generateToken;
const verifyToken = (token) => {
    if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET environment variable is not configured');
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET, {
            issuer: 'vault-backend',
            audience: 'vault-frontend'
        });
        return decoded;
    }
    catch (error) {
        if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
            throw new Error('Token has expired');
        }
        else if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            throw new Error('Invalid token');
        }
        else {
            throw new Error('Token verification failed');
        }
    }
};
exports.verifyToken = verifyToken;


export {};

// __CJS_EXPORT_BRIDGE__
const __cjs_exports: any = exports as any;
export const verifyToken = __cjs_exports.verifyToken;
export const generateToken = __cjs_exports.generateToken;
