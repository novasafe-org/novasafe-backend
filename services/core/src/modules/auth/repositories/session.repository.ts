import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import { ModelRegistry } from '../../../database';
import type { ISession } from '../../../database/schemas/sessions';
import { SESSION_MODEL_NAME } from '../../../database/schemas/sessions';

export class SessionRepository {
  constructor(
    private readonly model: Model<ISession> = ModelRegistry.get<ISession>(SESSION_MODEL_NAME),
  ) {}

  async create(data: Partial<ISession>): Promise<void> {
    await this.model.create(data);
  }

  async countActiveByUserId(userId: string): Promise<number> {
    return this.model.countDocuments({
      userId: new Types.ObjectId(userId),
      revoked: { $ne: true },
    });
  }

  async findActiveByTokenId(tokenId: string): Promise<ISession | null> {
    return this.model.findOne({ tokenId, revoked: { $ne: true } }).lean();
  }

  async findActiveByRefreshHash(refreshTokenHash: string): Promise<ISession | null> {
    return this.model
      .findOne({
        refreshTokenHash,
        revoked: { $ne: true },
        refreshExpiresAt: { $gt: new Date() },
      })
      .lean();
  }

  async revokeByTokenId(tokenId: string): Promise<void> {
    await this.model.updateOne(
      { tokenId },
      { $set: { revoked: true, revokedAt: new Date(), refreshTokenHash: null } },
    );
  }

  async revokeAllByUserId(userId: string): Promise<void> {
    await this.model.updateMany(
      { userId: new Types.ObjectId(userId), revoked: { $ne: true } },
      { $set: { revoked: true, revokedAt: new Date(), refreshTokenHash: null } },
    );
  }

  async updateActivityByTokenId(tokenId: string, fields: { deviceId?: string }): Promise<void> {
    await this.model.updateOne(
      { tokenId },
      {
        $set: {
          lastActivity: new Date(),
          ...(fields.deviceId ? { deviceId: fields.deviceId } : {}),
        },
      },
    );
  }

  async rotateTokens(
    previousTokenId: string,
    update: {
      tokenId: string;
      refreshTokenHash: string;
      refreshExpiresAt: Date;
      refreshRotatedAt: Date;
      deviceFingerprint: string;
      osVersion?: string | null;
      ipAddress?: string;
      lastIpPrefix?: string | null;
      lastGeoCountry?: string | null;
      lastGeoRegion?: string | null;
      biometricFailCount?: number;
      rotationIntervalMs: number;
      nextRotationAt: Date;
      riskSignals: string[];
      preferredStepUp?: string | null;
      deviceId?: string;
      deviceName?: string;
      platform?: string;
      userAgent?: string;
    },
  ): Promise<void> {
    await this.model.updateOne(
      { tokenId: previousTokenId, revoked: { $ne: true } },
      {
        $set: {
          tokenId: update.tokenId,
          refreshTokenHash: update.refreshTokenHash,
          refreshExpiresAt: update.refreshExpiresAt,
          refreshRotatedAt: update.refreshRotatedAt,
          deviceFingerprint: update.deviceFingerprint,
          osVersion: update.osVersion ?? null,
          ipAddress: update.ipAddress,
          lastIpPrefix: update.lastIpPrefix ?? null,
          lastGeoCountry: update.lastGeoCountry ?? null,
          lastGeoRegion: update.lastGeoRegion ?? null,
          biometricFailCount: update.biometricFailCount ?? 0,
          rotationIntervalMs: update.rotationIntervalMs,
          nextRotationAt: update.nextRotationAt,
          riskSignals: update.riskSignals,
          preferredStepUp: update.preferredStepUp ?? null,
          lastActivity: new Date(),
          ...(update.deviceId ? { deviceId: update.deviceId } : {}),
          ...(update.deviceName ? { deviceName: update.deviceName } : {}),
          ...(update.platform ? { platform: update.platform } : {}),
          ...(update.userAgent ? { userAgent: update.userAgent } : {}),
        },
      },
    );
  }

  async incrementBiometricFail(tokenId: string): Promise<number> {
    const result = await this.model.findOneAndUpdate(
      { tokenId, revoked: { $ne: true } },
      { $inc: { biometricFailCount: 1 }, $set: { lastActivity: new Date() } },
      { new: true },
    );
    return Number(result?.biometricFailCount || 0);
  }

  async resetBiometricFail(tokenId: string): Promise<void> {
    await this.model.updateOne(
      { tokenId, revoked: { $ne: true } },
      { $set: { biometricFailCount: 0, lastActivity: new Date() } },
    );
  }
}

let sessionRepo: SessionRepository | null = null;
export const getSessionRepository = (): SessionRepository => {
  if (!sessionRepo) sessionRepo = new SessionRepository();
  return sessionRepo;
};
