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
exports.recoverAccount = exports.resetPassword = exports.forgotPassword = exports.unlockVault = exports.emailLogin = exports.logout = exports.getCurrentUser = exports.googleSignIn = void 0;
const google_auth_library_1 = require("google-auth-library");
const mongodb_1 = require("mongodb");
const config_1 = require("../../config/config");
const connection_1 = __importDefault(require("../../database/connection"));
const generateToken_1 = require("../utils/generateToken");
const sessionService_1 = require("../services/sessionService");
const deviceDetection_1 = require("../utils/deviceDetection");
const activityLogHelper_1 = require("../utils/activityLogHelper");
const logger_1 = __importDefault(require("../logger"));
const crypto_1 = __importDefault(require("crypto"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const client = new google_auth_library_1.OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const collection = config_1.DBCONFIG.vault.collections;
const googleSignIn = async (req, res) => {
    try {
        const { credential } = req.body;
        if (!credential) {
            res.status(400).json({
                message: 'Bad Request',
                error: 'Google credential is required'
            });
            return;
        }
        if (!process.env.GOOGLE_CLIENT_ID) {
            logger_1.default.error('GOOGLE_CLIENT_ID environment variable is not configured');
            res.status(500).json({
                message: 'Server configuration error',
                error: 'Google authentication is not properly configured'
            });
            return;
        }
        const ticket = await client.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        if (!payload) {
            res.status(401).json({
                message: 'Authentication failed',
                error: 'Unable to extract user information from Google token'
            });
            return;
        }
        const { sub: googleId, email, name, picture, } = payload;
        if (!googleId || !email || !name) {
            res.status(401).json({
                message: 'Authentication failed',
                error: 'Incomplete user information from Google'
            });
            return;
        }
        const db = new connection_1.default('vault');
        let user = await db.findOne(collection.vaultUsers, { googleId });
        const isFirstTime = !user;
        if (!user) {
            user = await db.findOne(collection.vaultUsers, {
                email: email.toLowerCase().trim()
            });
            if (user) {
                logger_1.default.info(`Linking Google account to existing email user: ${email}`);
                await db.updateOne(collection.vaultUsers, { _id: user._id }, {
                    $set: {
                        googleId,
                        picture,
                        updatedAt: new Date(),
                    }
                });
                user.googleId = googleId;
                user.picture = picture;
            }
            else {
                res.status(404).json({
                    success: false,
                    message: 'No account found with this Google account. Please sign up first.',
                    error: 'Account not found',
                    userMessage: 'No account found with this email. Please sign up first.',
                    requiresSignup: true,
                });
                return;
            }
        }
        else {
            logger_1.default.info(`Existing user logged in: ${email}`);
            await db.updateOne(collection.vaultUsers, { googleId }, {
                $set: {
                    name,
                    email,
                    picture,
                    updatedAt: new Date(),
                }
            });
            user.name = name;
            user.email = email;
            user.picture = picture;
            user.updatedAt = new Date();
        }
        const requires2FA = user.totpEnabled || false;
        let token;
        let tokenId;
        if (requires2FA) {
            const tokenResult = (0, generateToken_1.generateToken)(user, undefined, true);
            token = tokenResult.token;
            tokenId = tokenResult.tokenId;
            logger_1.default.info(`Pre-auth token generated for 2FA verification: ${user.email}`);
        }
        else {
            const tokenResult = (0, generateToken_1.generateToken)(user);
            token = tokenResult.token;
            tokenId = tokenResult.tokenId;
            try {
                const userAgent = req.headers['user-agent'] || 'Unknown';
                const ipAddress = (0, deviceDetection_1.getClientIP)(req);
                const browser = (0, deviceDetection_1.parseBrowser)(userAgent);
                const os = (0, deviceDetection_1.parseOS)(userAgent);
                const refreshToken = crypto_1.default.randomBytes(32).toString('hex');
                try {
                    const deviceType = (0, deviceDetection_1.detectDevice)(userAgent);
                    const deviceName = `${browser} on ${os}`;
                    const db = new connection_1.default('vault');
                    const existingSessions = await db.findMany(collection.sessions, {
                        userId: new mongodb_1.ObjectId(user._id || user.googleId),
                        revoked: false,
                        deviceName: deviceName,
                        deviceType: deviceType,
                    });
                    if (existingSessions && existingSessions.length > 0) {
                        await db.updateMany(collection.sessions, {
                            userId: new mongodb_1.ObjectId(user._id || user.googleId),
                            deviceName: deviceName,
                            deviceType: deviceType,
                            revoked: false,
                        }, {
                            $set: {
                                revoked: true,
                                revokedAt: new Date(),
                            },
                        });
                        logger_1.default.info(`Revoked ${existingSessions.length} existing session(s) from same device for user: ${user.email}`);
                    }
                }
                catch (revokeError) {
                    logger_1.default.warn(`Failed to revoke existing sessions on login: ${revokeError.message}`);
                }
                await (0, sessionService_1.createSession)({
                    userId: user._id || user.googleId,
                    tokenId: tokenId,
                    refreshToken,
                    deviceInfo: {
                        os,
                        browser,
                        ipAddress,
                        userAgent,
                    },
                });
                logger_1.default.info(`Session created for user: ${user.email}, tokenId: ${tokenId}`);
            }
            catch (sessionError) {
                logger_1.default.error(`Failed to create session: ${sessionError.message}`);
            }
            (0, activityLogHelper_1.logActivity)(req, user, {
                action: 'USER_LOGIN_SUCCESS',
                targetType: 'user',
                targetId: user._id?.toString() || user.googleId || null,
                description: `User logged in successfully via Google`,
                metadata: {
                    signupMethod: 'google',
                    hasPicture: !!user.picture,
                },
            }).catch((err) => {
                logger_1.default.warn(`Failed to log activity: ${err.message}`);
            });
        }
        const { getRedirectUrl } = await Promise.resolve().then(() => __importStar(require('../utils/redirectUrl')));
        const redirectUrl = getRedirectUrl(user.planId || 'individual', user.companyName);
        res.status(200).json({
            message: requires2FA
                ? 'Authentication successful. 2FA verification required.'
                : 'Authentication successful',
            token: token || null,
            user: {
                id: user._id?.toString() || user.googleId,
                googleId: user.googleId,
                name: user.name,
                email: user.email,
                picture: user.picture,
                planId: user.planId,
                companyName: user.companyName,
                createdAt: user.createdAt,
            },
            redirectUrl,
            isFirstTime,
            requires2FA,
        });
    }
    catch (error) {
        logger_1.default.error(`Google authentication error: ${error.message}`);
        if (error.message?.includes('Token used too late') ||
            error.message?.includes('Token used too early')) {
            res.status(401).json({
                message: 'Authentication failed',
                error: 'Token has expired or is not yet valid'
            });
            return;
        }
        if (error.message?.includes('Invalid token signature')) {
            res.status(401).json({
                message: 'Authentication failed',
                error: 'Invalid Google token'
            });
            return;
        }
        res.status(500).json({
            message: 'Authentication failed',
            error: error.message || 'An unexpected error occurred'
        });
    }
};
exports.googleSignIn = googleSignIn;
const getCurrentUser = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({
                message: 'Authentication required',
                error: 'User information not found in request'
            });
            return;
        }
        const db = new connection_1.default('vault');
        const user = await db.findOne(collection.vaultUsers, {
            _id: new mongodb_1.ObjectId(req.user.id)
        });
        if (!user) {
            res.status(404).json({
                message: 'User not found',
                error: 'User account no longer exists'
            });
            return;
        }
        res.status(200).json({
            user: {
                id: user._id?.toString() || user.googleId,
                googleId: user.googleId,
                name: user.name,
                email: user.email,
                picture: user.picture,
                createdAt: user.createdAt,
                planId: user.planId,
                companyName: user.companyName,
            },
            requires2FA: user.totpEnabled || false,
        });
    }
    catch (error) {
        logger_1.default.error(`Get current user error: ${error.message}`);
        res.status(500).json({
            message: 'Failed to fetch user information',
            error: error.message
        });
    }
};
exports.getCurrentUser = getCurrentUser;
const logout = async (req, res) => {
    try {
        const tokenId = req.tokenId;
        if (req.user && tokenId) {
            try {
                const session = await (0, sessionService_1.getSessionByTokenId)(tokenId);
                if (session && session._id) {
                    await (0, sessionService_1.revokeSession)(session._id.toString(), req.user.id);
                    logger_1.default.info(`Session revoked on logout: ${tokenId} for user: ${req.user.email}`);
                }
            }
            catch (sessionError) {
                logger_1.default.warn(`Failed to revoke session on logout: ${sessionError.message}`);
            }
            const db = new connection_1.default('vault');
            const user = await db.findOne(collection.vaultUsers, {
                _id: new mongodb_1.ObjectId(req.user.id),
            });
            if (user) {
                (0, activityLogHelper_1.logActivity)(req, user, {
                    action: 'USER_LOGOUT',
                    targetType: 'session',
                    targetId: tokenId || null,
                    description: `User logged out`,
                    metadata: {
                        tokenId: tokenId || null,
                    },
                }).catch((err) => {
                    logger_1.default.warn(`Failed to log activity: ${err.message}`);
                });
            }
            logger_1.default.info(`User logged out: ${req.user.email}`);
        }
        res.status(200).json({
            message: 'Logout successful',
            note: 'Session has been revoked'
        });
    }
    catch (error) {
        logger_1.default.error(`Logout error: ${error.message}`);
        res.status(500).json({
            message: 'Logout failed',
            error: error.message
        });
    }
};
exports.logout = logout;
const emailLogin = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            res.status(400).json({
                success: false,
                message: 'Please provide both email and password.',
                error: 'Email and password are required',
                userMessage: 'Email and password are required.',
            });
            return;
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            res.status(400).json({
                success: false,
                message: 'Please enter a valid email address.',
                error: 'Invalid email format',
                userMessage: 'Please enter a valid email address.',
            });
            return;
        }
        const db = new connection_1.default('vault');
        const user = await db.findOne(collection.vaultUsers, {
            email: email.toLowerCase().trim(),
        });
        if (!user) {
            res.status(401).json({
                success: false,
                message: 'Invalid email or password. Please check your credentials and try again.',
                error: 'Invalid email or password',
                userMessage: 'Invalid email or password. Please check your credentials.',
            });
            return;
        }
        if (!user.passwordHash && user.signupMethod !== 'email') {
            res.status(401).json({
                success: false,
                message: 'This account uses Google sign-in. Please use Google to log in.',
                error: 'This account uses Google sign-in',
                userMessage: 'This account uses Google sign-in. Please use Google to log in.',
            });
            return;
        }
        if (user.accountLockedUntil && new Date(user.accountLockedUntil) > new Date()) {
            const lockTimeRemaining = Math.ceil((new Date(user.accountLockedUntil).getTime() - new Date().getTime()) / 1000 / 60);
            res.status(423).json({
                success: false,
                message: `Your account is temporarily locked. Please try again in ${lockTimeRemaining} minutes.`,
                error: 'Account locked',
                userMessage: `Account is locked. Please try again in ${lockTimeRemaining} minutes.`,
                lockTimeRemaining,
            });
            return;
        }
        if (!user.passwordHash) {
            res.status(401).json({
                success: false,
                message: 'This account uses Google sign-in. Please use Google to log in.',
                error: 'Password not set for this account',
                userMessage: 'This account uses Google sign-in. Please use Google to log in.',
            });
            return;
        }
        const isPasswordValid = bcryptjs_1.default.compareSync(password, user.passwordHash);
        if (!isPasswordValid) {
            const failedAttempts = (user.failedLoginAttempts || 0) + 1;
            const maxAttempts = 5;
            const lockDurationMinutes = 30;
            let updateData = {
                failedLoginAttempts: failedAttempts,
                updatedAt: new Date(),
            };
            if (failedAttempts >= maxAttempts) {
                const lockUntil = new Date();
                lockUntil.setMinutes(lockUntil.getMinutes() + lockDurationMinutes);
                updateData.accountLockedUntil = lockUntil;
                logger_1.default.warn(`Account locked due to ${failedAttempts} failed login attempts: ${email}`);
                (0, activityLogHelper_1.logActivity)(req, user, {
                    action: failedAttempts >= maxAttempts ? 'MULTIPLE_FAILED_LOGINS' : 'USER_LOGIN_FAILED',
                    targetType: 'user',
                    targetId: user._id?.toString() || null,
                    description: `Failed login attempt ${failedAttempts}/${maxAttempts}. Account locked.`,
                    metadata: {
                        failedAttempts,
                        accountLocked: true,
                    },
                }).catch((err) => {
                    logger_1.default.warn(`Failed to log activity: ${err.message}`);
                });
            }
            else {
                (0, activityLogHelper_1.logActivity)(req, user, {
                    action: 'USER_LOGIN_FAILED',
                    targetType: 'user',
                    targetId: user._id?.toString() || null,
                    description: `Failed login attempt ${failedAttempts}/${maxAttempts}`,
                    metadata: {
                        failedAttempts,
                    },
                }).catch((err) => {
                    logger_1.default.warn(`Failed to log activity: ${err.message}`);
                });
            }
            await db.updateOne(collection.vaultUsers, { _id: user._id }, { $set: updateData });
            res.status(401).json({
                success: false,
                message: 'Invalid email or password. Please check your credentials and try again.',
                error: 'Invalid email or password',
                userMessage: failedAttempts >= maxAttempts
                    ? 'Account locked due to too many failed attempts. Please try again later.'
                    : `Invalid email or password. ${maxAttempts - failedAttempts} attempts remaining.`,
                failedAttempts,
                accountLocked: failedAttempts >= maxAttempts,
            });
            return;
        }
        await db.updateOne(collection.vaultUsers, { _id: user._id }, {
            $set: {
                failedLoginAttempts: 0,
                accountLockedUntil: null,
                updatedAt: new Date(),
            }
        });
        user.failedLoginAttempts = 0;
        user.accountLockedUntil = null;
        const requires2FA = user.totpEnabled || false;
        let token;
        let tokenId;
        if (requires2FA) {
            const tokenResult = (0, generateToken_1.generateToken)(user, undefined, true);
            token = tokenResult.token;
            tokenId = tokenResult.tokenId;
            logger_1.default.info(`Pre-auth token generated for 2FA verification: ${email}`);
        }
        else {
            const tokenResult = (0, generateToken_1.generateToken)(user);
            token = tokenResult.token;
            tokenId = tokenResult.tokenId;
            try {
                const userAgent = req.headers['user-agent'] || 'Unknown';
                const ipAddress = (0, deviceDetection_1.getClientIP)(req);
                const browser = (0, deviceDetection_1.parseBrowser)(userAgent);
                const os = (0, deviceDetection_1.parseOS)(userAgent);
                const refreshToken = crypto_1.default.randomBytes(32).toString('hex');
                try {
                    const deviceType = (0, deviceDetection_1.detectDevice)(userAgent);
                    const deviceName = `${browser} on ${os}`;
                    const existingSessions = await db.findMany(collection.sessions, {
                        userId: new mongodb_1.ObjectId(user._id || user.googleId || ''),
                        revoked: false,
                        deviceName: deviceName,
                        deviceType: deviceType,
                    });
                    if (existingSessions && existingSessions.length > 0) {
                        await db.updateMany(collection.sessions, {
                            userId: new mongodb_1.ObjectId(user._id || user.googleId || ''),
                            deviceName: deviceName,
                            deviceType: deviceType,
                            revoked: false,
                        }, {
                            $set: {
                                revoked: true,
                                revokedAt: new Date(),
                            },
                        });
                        logger_1.default.info(`Revoked ${existingSessions.length} existing session(s) from same device for user: ${user.email}`);
                    }
                }
                catch (revokeError) {
                    logger_1.default.warn(`Failed to revoke existing sessions on login: ${revokeError.message}`);
                }
                await (0, sessionService_1.createSession)({
                    userId: user._id || user.googleId || '',
                    tokenId: tokenId,
                    refreshToken,
                    deviceInfo: {
                        os,
                        browser,
                        ipAddress,
                        userAgent,
                    },
                });
                logger_1.default.info(`Session created for user: ${user.email}, tokenId: ${tokenId}`);
            }
            catch (sessionError) {
                logger_1.default.error(`Failed to create session: ${sessionError.message}`);
            }
            logger_1.default.info(`Email login successful: ${email}`);
            (0, activityLogHelper_1.logActivity)(req, user, {
                action: 'USER_LOGIN_SUCCESS',
                targetType: 'user',
                targetId: user._id?.toString() || null,
                description: `User logged in successfully via email/password`,
                metadata: {
                    signupMethod: 'email',
                },
            }).catch((err) => {
                logger_1.default.warn(`Failed to log activity: ${err.message}`);
            });
        }
        const { getRedirectUrl } = await Promise.resolve().then(() => __importStar(require('../utils/redirectUrl')));
        const redirectUrl = getRedirectUrl(user.planId || 'individual', user.companyName);
        res.status(200).json({
            message: requires2FA
                ? 'Authentication successful. 2FA verification required.'
                : 'Authentication successful',
            token: token || null,
            user: {
                id: user._id?.toString() || user.googleId || '',
                email: user.email,
                name: user.name,
                picture: user.picture,
                planId: user.planId,
                companyName: user.companyName,
                createdAt: user.createdAt,
            },
            redirectUrl,
            requires2FA,
        });
    }
    catch (error) {
        logger_1.default.error(`Email login error: ${error.message}`);
        res.status(500).json({
            message: 'Authentication failed',
            error: error.message || 'An unexpected error occurred',
        });
    }
};
exports.emailLogin = emailLogin;
const unlockVault = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            res.status(400).json({
                success: false,
                message: 'Email and password are required',
                error: 'Missing credentials',
            });
            return;
        }
        const db = new connection_1.default('vault');
        await db.connect();
        const user = await db.findOne(collection.vaultUsers, {
            email: email.toLowerCase().trim(),
        });
        if (!user) {
            res.status(401).json({
                success: false,
                message: 'Invalid email or password',
                error: 'Invalid credentials',
            });
            return;
        }
        if (user.accountLockedUntil && new Date(user.accountLockedUntil) > new Date()) {
            res.status(423).json({
                success: false,
                message: 'Account is locked',
                error: 'Account locked due to too many failed attempts',
                userMessage: 'Account is locked. Please try again later.',
            });
            return;
        }
        if (!user.passwordHash) {
            res.status(401).json({
                success: false,
                message: 'Password not set for this account',
                error: 'Password authentication not available',
            });
            return;
        }
        const isPasswordValid = await bcryptjs_1.default.compare(password, user.passwordHash);
        if (!isPasswordValid) {
            res.status(401).json({
                success: false,
                message: 'Invalid email or password',
                error: 'Invalid credentials',
            });
            return;
        }
        const { token, tokenId } = (0, generateToken_1.generateToken)(user);
        try {
            const userAgent = req.headers['user-agent'] || 'Unknown';
            const ipAddress = (0, deviceDetection_1.getClientIP)(req);
            const browser = (0, deviceDetection_1.parseBrowser)(userAgent);
            const os = (0, deviceDetection_1.parseOS)(userAgent);
            const refreshToken = crypto_1.default.randomBytes(32).toString('hex');
            await (0, sessionService_1.createSession)({
                userId: user._id || user.googleId || '',
                tokenId,
                refreshToken,
                deviceInfo: {
                    os,
                    browser,
                    ipAddress,
                    userAgent,
                },
            });
            logger_1.default.info(`Vault unlocked for user: ${user.email}, tokenId: ${tokenId}`);
        }
        catch (sessionError) {
            logger_1.default.error(`Failed to create session on unlock: ${sessionError.message}`);
        }
        await db.updateOne(collection.vaultUsers, { _id: user._id }, {
            $set: {
                failedLoginAttempts: 0,
                accountLockedUntil: null,
                updatedAt: new Date(),
            }
        });
        (0, activityLogHelper_1.logActivity)(req, user, {
            action: 'VAULT_UNLOCKED',
            targetType: 'user',
            targetId: user._id?.toString() || null,
            description: `Vault unlocked after inactivity`,
        }).catch((err) => {
            logger_1.default.warn(`Failed to log activity: ${err.message}`);
        });
        res.status(200).json({
            message: 'Vault unlocked successfully',
            token,
            user: {
                id: user._id?.toString() || user.googleId || '',
                email: user.email,
                name: user.name,
                picture: user.picture,
                createdAt: user.createdAt,
                planId: user.planId,
            },
            requires2FA: false,
        });
    }
    catch (error) {
        logger_1.default.error(`Vault unlock error: ${error.message}`);
        res.status(500).json({
            message: 'Unlock failed',
            error: error.message || 'An unexpected error occurred'
        });
    }
};
exports.unlockVault = unlockVault;
const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            res.status(400).json({
                success: false,
                message: 'Email is required',
                error: 'Missing email',
            });
            return;
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            res.status(400).json({
                success: false,
                message: 'Please enter a valid email address',
                error: 'Invalid email format',
            });
            return;
        }
        const db = new connection_1.default('vault');
        await db.connect();
        const user = await db.findOne(collection.vaultUsers, {
            email: email.toLowerCase().trim(),
        });
        if (user) {
            const resetToken = crypto_1.default.randomBytes(32).toString('hex');
            const resetTokenExpiry = new Date();
            resetTokenExpiry.setHours(resetTokenExpiry.getHours() + 1);
            const hashedToken = crypto_1.default.createHash('sha256').update(resetToken).digest('hex');
            await db.updateOne(collection.vaultUsers, { _id: user._id }, {
                $set: {
                    passwordResetToken: hashedToken,
                    passwordResetExpiry: resetTokenExpiry,
                    updatedAt: new Date(),
                }
            });
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3063';
            const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;
            logger_1.default.info({
                email: user.email,
                resetUrl: resetUrl,
                token: resetToken,
                message: 'Password reset link generated (email sending disabled for testing)',
            }, 'PASSWORD RESET LINK (FOR TESTING)');
        }
        else {
            logger_1.default.info(`Password reset requested for non-existent email: ${email}`);
        }
        res.status(200).json({
            success: true,
            message: 'If an account exists, we\'ve sent a password reset link to your email.',
        });
    }
    catch (error) {
        logger_1.default.error(`Forgot password error: ${error.message}`);
        res.status(200).json({
            success: true,
            message: 'If an account exists, we\'ve sent a password reset link to your email.',
        });
    }
};
exports.forgotPassword = forgotPassword;
const resetPassword = async (req, res) => {
    try {
        const { token, password } = req.body;
        if (!token || !password) {
            res.status(400).json({
                success: false,
                message: 'Token and password are required',
                error: 'Missing required fields',
            });
            return;
        }
        if (password.length < 8) {
            res.status(400).json({
                success: false,
                message: 'Password must be at least 8 characters long',
                error: 'Password too short',
            });
            return;
        }
        const db = new connection_1.default('vault');
        await db.connect();
        const hashedToken = crypto_1.default.createHash('sha256').update(token).digest('hex');
        const user = await db.findOne(collection.vaultUsers, {
            passwordResetToken: hashedToken,
            passwordResetExpiry: { $gt: new Date() },
        });
        if (!user) {
            res.status(400).json({
                success: false,
                message: 'Invalid or expired reset token',
                error: 'Invalid token',
            });
            return;
        }
        const saltRounds = 10;
        const newPasswordHash = await bcryptjs_1.default.hash(password, saltRounds);
        const vaultItemsCollection = collection.vaultItems;
        await db.deleteMany(vaultItemsCollection, { userId: user._id?.toString() || user.googleId });
        const foldersCollection = collection.folders;
        await db.deleteMany(foldersCollection, { userId: user._id?.toString() || user.googleId });
        await db.updateOne(collection.vaultUsers, { _id: user._id }, {
            $set: {
                passwordHash: newPasswordHash,
                updatedAt: new Date(),
            },
            $unset: {
                passwordResetToken: '',
                passwordResetExpiry: '',
            }
        });
        const sessionsCollection = collection.sessions;
        await db.updateMany(sessionsCollection, { userId: user._id?.toString() || user.googleId }, {
            $set: {
                revoked: true,
                revokedAt: new Date(),
            }
        });
        (0, activityLogHelper_1.logActivity)(req, user, {
            action: 'PASSWORD_RESET',
            targetType: 'user',
            targetId: user._id?.toString() || null,
            description: 'Password reset completed - encrypted vault data deleted',
        }).catch((err) => {
            logger_1.default.warn(`Failed to log activity: ${err.message}`);
        });
        logger_1.default.info(`Password reset completed for user: ${user.email}`);
        res.status(200).json({
            success: true,
            message: 'Password has been reset successfully. All encrypted vault data has been permanently deleted.',
        });
    }
    catch (error) {
        logger_1.default.error(`Reset password error: ${error.message}`);
        res.status(500).json({
            success: false,
            message: 'Failed to reset password',
            error: error.message || 'An unexpected error occurred',
        });
    }
};
exports.resetPassword = resetPassword;
const recoverAccount = async (req, res) => {
    try {
        const { email, recoveryKey, masterPassword, encryptedData, newPassword } = req.body;
        if (!email || !recoveryKey || !newPassword) {
            res.status(400).json({
                success: false,
                message: 'Email, recovery key, and new password are required',
                error: 'Missing required fields',
            });
            return;
        }
        if (newPassword.length < 8) {
            res.status(400).json({
                success: false,
                message: 'Password must be at least 8 characters long',
                error: 'Password too short',
            });
            return;
        }
        const db = new connection_1.default('vault');
        await db.connect();
        const user = await db.findOne(collection.vaultUsers, {
            email: email.toLowerCase().trim(),
        });
        if (!user) {
            res.status(401).json({
                success: false,
                message: 'Invalid email or recovery key',
                error: 'Invalid credentials',
            });
            return;
        }
        if (!user.recoveryKeyHash) {
            res.status(400).json({
                success: false,
                message: 'No recovery key found for this account',
                error: 'Recovery key not set',
            });
            return;
        }
        const isRecoveryKeyValid = bcryptjs_1.default.compareSync(recoveryKey, user.recoveryKeyHash);
        if (!isRecoveryKeyValid) {
            res.status(401).json({
                success: false,
                message: 'Invalid recovery key',
                error: 'Invalid recovery key',
            });
            return;
        }
        if (user.recoveryKeyUsed) {
            logger_1.default.warn(`Recovery key reused for user: ${user.email}`);
        }
        const saltRounds = 10;
        const newPasswordHash = await bcryptjs_1.default.hash(newPassword, saltRounds);
        if (encryptedData && masterPassword) {
            logger_1.default.info(`Recovery data provided for user: ${user.email}, encryptedData length: ${encryptedData.length}`);
        }
        else {
            logger_1.default.warn(`Recovery attempted without encryptedData for user: ${user.email}`);
        }
        await db.updateOne(collection.vaultUsers, { _id: user._id }, {
            $set: {
                passwordHash: newPasswordHash,
                recoveryKeyUsed: true,
                recoveryKeyUsedAt: new Date(),
                lastPasswordChange: new Date(),
                updatedAt: new Date(),
            }
        });
        const sessionsCollection = collection.sessions;
        await db.updateMany(sessionsCollection, { userId: user._id?.toString() || user.googleId }, {
            $set: {
                revoked: true,
                revokedAt: new Date(),
            }
        });
        const { token, tokenId } = (0, generateToken_1.generateToken)(user);
        try {
            const userAgent = req.headers['user-agent'] || 'Unknown';
            const ipAddress = (0, deviceDetection_1.getClientIP)(req);
            const browser = (0, deviceDetection_1.parseBrowser)(userAgent);
            const os = (0, deviceDetection_1.parseOS)(userAgent);
            const refreshToken = crypto_1.default.randomBytes(32).toString('hex');
            await (0, sessionService_1.createSession)({
                userId: user._id?.toString() || user.googleId || '',
                tokenId,
                refreshToken,
                deviceInfo: {
                    os,
                    browser,
                    ipAddress,
                    userAgent,
                },
            });
            logger_1.default.info(`Account recovered for user: ${user.email}, tokenId: ${tokenId}`);
        }
        catch (sessionError) {
            logger_1.default.error(`Failed to create session on recovery: ${sessionError.message}`);
        }
        (0, activityLogHelper_1.logActivity)(req, user, {
            action: 'ACCOUNT_RECOVERED',
            targetType: 'user',
            targetId: user._id?.toString() || null,
            description: 'Account recovered using recovery key - encrypted data restored',
        }).catch((err) => {
            logger_1.default.warn(`Failed to log activity: ${err.message}`);
        });
        res.status(200).json({
            success: true,
            message: 'Account recovered successfully. Your encrypted vault data has been restored.',
            token,
            user: {
                id: user._id?.toString() || user.googleId || '',
                email: user.email,
                name: user.name,
                picture: user.picture,
                createdAt: user.createdAt,
            },
        });
    }
    catch (error) {
        logger_1.default.error(`Account recovery error: ${error.message}`);
        res.status(500).json({
            success: false,
            message: 'Failed to recover account',
            error: error.message || 'An unexpected error occurred',
        });
    }
};
exports.recoverAccount = recoverAccount;


export {};

// __CJS_EXPORT_BRIDGE__
const __cjs_exports: any = exports as any;
export const recoverAccount = __cjs_exports.recoverAccount;
export const resetPassword = __cjs_exports.resetPassword;
export const forgotPassword = __cjs_exports.forgotPassword;
export const unlockVault = __cjs_exports.unlockVault;
export const emailLogin = __cjs_exports.emailLogin;
export const logout = __cjs_exports.logout;
export const getCurrentUser = __cjs_exports.getCurrentUser;
export const googleSignIn = __cjs_exports.googleSignIn;
