// @ts-nocheck
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveUserPublicKey = exports.getUserPublicKey = exports.getShareById = exports.updateSharePermission = exports.revokeShare = exports.getSharesBySharer = exports.getSharesForRecipient = exports.createShare = void 0;
const mongodb_1 = require("mongodb");
const connection_1 = __importDefault(require("../../database/connection"));
const config_1 = require("../../config/config");
const logger_1 = __importDefault(require("../logger"));
const collection = config_1.DBCONFIG.vault.collections;
const createShare = async (sharerId, recipientId, shareType, resourceId, permission, wrappedKey, wrappedKeyIV, message, integrityHash, recipientKeyId) => {
    try {
        if (!mongodb_1.ObjectId.isValid(sharerId)) {
            throw new Error('Invalid sharer ID format');
        }
        if (!mongodb_1.ObjectId.isValid(recipientId)) {
            throw new Error('Invalid recipient ID format');
        }
        if (!mongodb_1.ObjectId.isValid(resourceId)) {
            throw new Error('Invalid resource ID format');
        }
        const db = new connection_1.default('vault');
        const existingShare = await db.findOne(collection.shares, {
            sharerId: new mongodb_1.ObjectId(sharerId),
            recipientId: new mongodb_1.ObjectId(recipientId),
            resourceId: new mongodb_1.ObjectId(resourceId),
            shareType,
            active: true,
        });
        if (existingShare) {
            const updatedShare = {
                permission,
                wrappedKey,
                wrappedKeyIV,
                message,
                integrityHash,
                updatedAt: new Date().toISOString(),
                active: true,
                revokedAt: null,
            };
            if (recipientKeyId) {
                updatedShare.recipientKeyId = new mongodb_1.ObjectId(recipientKeyId);
            }
            await db.updateOne(collection.shares, { _id: existingShare._id }, { $set: updatedShare });
            return {
                ...existingShare,
                ...updatedShare,
            };
        }
        const newShare = {
            sharerId: new mongodb_1.ObjectId(sharerId),
            recipientId: new mongodb_1.ObjectId(recipientId),
            shareType,
            resourceId: new mongodb_1.ObjectId(resourceId),
            permission,
            wrappedKey,
            wrappedKeyIV,
            message,
            integrityHash,
            active: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        if (recipientKeyId) {
            newShare.recipientKeyId = new mongodb_1.ObjectId(recipientKeyId);
        }
        const result = await db.insertOne(collection.shares, newShare);
        const storedShare = await db.findOne(collection.shares, {
            _id: result.insertedId,
        });
        if (!storedShare) {
            throw new Error('Failed to verify share was stored correctly');
        }
        if (storedShare.wrappedKey !== wrappedKey) {
            logger_1.default.error(`Wrapped key mismatch after storage! Original length: ${wrappedKey.length}, Stored length: ${storedShare.wrappedKey?.length || 0}`);
            throw new Error('Wrapped key was corrupted during storage');
        }
        logger_1.default.info(`Share stored and verified: ${result.insertedId}, wrappedKey length: ${wrappedKey.length}`);
        return {
            ...newShare,
            _id: result.insertedId,
        };
    }
    catch (error) {
        logger_1.default.error(`Error creating share: ${error.message}`);
        throw error;
    }
};
exports.createShare = createShare;
const getSharesForRecipient = async (recipientId) => {
    try {
        const db = new connection_1.default('vault');
        const shares = await db.findMany(collection.shares, {
            recipientId: new mongodb_1.ObjectId(recipientId),
            active: true,
        });
        const recipientCurrentKeys = await (0, exports.getUserPublicKey)(recipientId);
        const recipientCurrentKeyId = recipientCurrentKeys?._id?.toString() || null;
        const sharesWithSharer = await Promise.all(shares.map(async (share) => {
            const sharer = await db.findOne(collection.vaultUsers, {
                _id: new mongodb_1.ObjectId(share.sharerId),
            });
            let resourceName = null;
            if (share.shareType === 'folder') {
                const folder = await db.findOne(collection.folders, {
                    _id: new mongodb_1.ObjectId(share.resourceId),
                });
                resourceName = folder?.name || null;
            }
            else {
                const item = await db.findOne(collection.vaultItems, {
                    $or: [
                        { _id: new mongodb_1.ObjectId(share.resourceId) },
                        { id: share.resourceId }
                    ],
                });
                resourceName = item?.title || null;
            }
            const shareKeyId = share.recipientKeyId?.toString() || null;
            const keyMismatch = shareKeyId && recipientCurrentKeyId && shareKeyId !== recipientCurrentKeyId;
            let wrappedKeyValid = true;
            let wrappedKeyError = null;
            if (share.wrappedKey) {
                try {
                    const decoded = Buffer.from(share.wrappedKey, 'base64');
                    if (decoded.length === 0) {
                        wrappedKeyValid = false;
                        wrappedKeyError = 'Invalid base64 format - decoded length is 0';
                    }
                    else if (decoded.length < 200 || decoded.length > 300) {
                        logger_1.default.warn(`Share ${share._id?.toString()} wrappedKey has unusual length: ${decoded.length} bytes (expected ~256)`);
                    }
                }
                catch (error) {
                    wrappedKeyValid = false;
                    wrappedKeyError = `Base64 decode error: ${error.message}`;
                    logger_1.default.error(`Share ${share._id?.toString()} has invalid wrappedKey format: ${wrappedKeyError}`);
                }
            }
            else {
                wrappedKeyValid = false;
                wrappedKeyError = 'wrappedKey is missing';
                logger_1.default.error(`Share ${share._id?.toString()} is missing wrappedKey`);
            }
            return {
                ...share,
                sharerEmail: sharer?.email || null,
                sharerName: sharer?.name || null,
                sharerPicture: sharer?.picture || null,
                resourceName,
                keyMismatch,
                recipientKeyId: shareKeyId,
                wrappedKeyValid,
                wrappedKeyError,
            };
        }));
        return sharesWithSharer;
    }
    catch (error) {
        logger_1.default.error(`Error fetching shares for recipient: ${error.message}`);
        throw error;
    }
};
exports.getSharesForRecipient = getSharesForRecipient;
const getSharesBySharer = async (sharerId) => {
    try {
        const db = new connection_1.default('vault');
        const shares = await db.findMany(collection.shares, {
            sharerId: new mongodb_1.ObjectId(sharerId),
            active: true,
        });
        const sharesWithRecipient = await Promise.all(shares.map(async (share) => {
            const recipient = await db.findOne(collection.vaultUsers, {
                _id: new mongodb_1.ObjectId(share.recipientId),
            });
            let resourceName = null;
            if (share.shareType === 'folder') {
                const folder = await db.findOne(collection.folders, {
                    _id: new mongodb_1.ObjectId(share.resourceId),
                });
                resourceName = folder?.name || null;
            }
            else {
                const item = await db.findOne(collection.vaultItems, {
                    $or: [
                        { _id: new mongodb_1.ObjectId(share.resourceId) },
                        { id: share.resourceId }
                    ],
                });
                resourceName = item?.title || null;
            }
            return {
                ...share,
                recipientEmail: recipient?.email || null,
                recipientName: recipient?.name || null,
                recipientPicture: recipient?.picture || null,
                resourceName,
            };
        }));
        return sharesWithRecipient;
    }
    catch (error) {
        logger_1.default.error(`Error fetching shares by sharer: ${error.message}`);
        throw error;
    }
};
exports.getSharesBySharer = getSharesBySharer;
const revokeShare = async (shareId, userId) => {
    try {
        const db = new connection_1.default('vault');
        const share = await db.findOne(collection.shares, {
            _id: new mongodb_1.ObjectId(shareId),
        });
        if (!share) {
            throw new Error('Share not found');
        }
        if (share.sharerId.toString() !== userId) {
            throw new Error('Unauthorized: Only the sharer can revoke a share');
        }
        await db.updateOne(collection.shares, { _id: new mongodb_1.ObjectId(shareId) }, {
            $set: {
                active: false,
                revokedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            },
        });
        logger_1.default.info(`Share ${shareId} revoked by user ${userId}`);
    }
    catch (error) {
        logger_1.default.error(`Error revoking share: ${error.message}`);
        throw error;
    }
};
exports.revokeShare = revokeShare;
const updateSharePermission = async (shareId, userId, permission) => {
    try {
        const db = new connection_1.default('vault');
        const share = await db.findOne(collection.shares, {
            _id: new mongodb_1.ObjectId(shareId),
        });
        if (!share) {
            throw new Error('Share not found');
        }
        if (share.sharerId.toString() !== userId) {
            throw new Error('Unauthorized: Only the sharer can update permissions');
        }
        await db.updateOne(collection.shares, { _id: new mongodb_1.ObjectId(shareId) }, {
            $set: {
                permission,
                updatedAt: new Date().toISOString(),
            },
        });
        logger_1.default.info(`Share ${shareId} permission updated to ${permission} by user ${userId}`);
    }
    catch (error) {
        logger_1.default.error(`Error updating share permission: ${error.message}`);
        throw error;
    }
};
exports.updateSharePermission = updateSharePermission;
const getShareById = async (shareId, userId) => {
    try {
        const db = new connection_1.default('vault');
        const share = await db.findOne(collection.shares, {
            _id: new mongodb_1.ObjectId(shareId),
            active: true,
        });
        if (!share) {
            return null;
        }
        if (share.sharerId.toString() !== userId &&
            share.recipientId.toString() !== userId) {
            throw new Error('Unauthorized: You do not have access to this share');
        }
        return share;
    }
    catch (error) {
        logger_1.default.error(`Error fetching share: ${error.message}`);
        throw error;
    }
};
exports.getShareById = getShareById;
const getUserPublicKey = async (userId) => {
    try {
        const db = new connection_1.default('vault');
        const userKeys = await db.findOne(collection.userKeys, {
            userId: new mongodb_1.ObjectId(userId),
            active: true,
        });
        return userKeys;
    }
    catch (error) {
        logger_1.default.error(`Error fetching user public key: ${error.message}`);
        throw error;
    }
};
exports.getUserPublicKey = getUserPublicKey;
const saveUserPublicKey = async (userId, publicKey, keyAlgorithm = 'RSA-OAEP') => {
    try {
        const db = new connection_1.default('vault');
        const existingKeys = await db.findOne(collection.userKeys, {
            userId: new mongodb_1.ObjectId(userId),
        });
        if (existingKeys) {
            await db.updateOne(collection.userKeys, { userId: new mongodb_1.ObjectId(userId) }, {
                $set: {
                    publicKey,
                    keyAlgorithm,
                    updatedAt: new Date().toISOString(),
                    active: true,
                },
            });
            return {
                ...existingKeys,
                publicKey,
                keyAlgorithm,
                updatedAt: new Date().toISOString(),
                active: true,
            };
        }
        const newKeys = {
            userId: new mongodb_1.ObjectId(userId),
            publicKey,
            keyAlgorithm,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            active: true,
        };
        const result = await db.insertOne(collection.userKeys, newKeys);
        return {
            ...newKeys,
            _id: result.insertedId,
        };
    }
    catch (error) {
        logger_1.default.error(`Error saving user public key: ${error.message}`);
        throw error;
    }
};
exports.saveUserPublicKey = saveUserPublicKey;


export {};

// __CJS_EXPORT_BRIDGE__
const __cjs_exports: any = exports as any;
export const saveUserPublicKey = __cjs_exports.saveUserPublicKey;
export const getUserPublicKey = __cjs_exports.getUserPublicKey;
export const getShareById = __cjs_exports.getShareById;
export const updateSharePermission = __cjs_exports.updateSharePermission;
export const revokeShare = __cjs_exports.revokeShare;
export const getSharesBySharer = __cjs_exports.getSharesBySharer;
export const getSharesForRecipient = __cjs_exports.getSharesForRecipient;
export const createShare = __cjs_exports.createShare;
