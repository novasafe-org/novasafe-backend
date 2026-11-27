import type { Model } from 'mongoose';
import { ObjectId } from '../../../database/object-id';
import { ModelRegistry } from '../../../database';
import type { ITrustedDevice } from '../../../database/schemas/devices';
import { DEVICE_MODEL_NAME } from '../../../database/schemas/devices';

export class TrustedDeviceRepository {
  constructor(
    private readonly model: Model<ITrustedDevice> = ModelRegistry.get<ITrustedDevice>(DEVICE_MODEL_NAME),
  ) {}

  async countActiveByUserId(userId: string): Promise<number> {
    return this.model.countDocuments({
      userId: new ObjectId(userId),
      isActive: true,
      trusted: true,
    });
  }

  async findByUserAndKey(userId: string, deviceKey: string): Promise<ITrustedDevice | null> {
    return this.model
      .findOne({
        userId: new ObjectId(userId),
        deviceKey,
        isActive: true,
      })
      .lean();
  }

  async listActiveByUserId(userId: string): Promise<ITrustedDevice[]> {
    return this.model
      .find({
        userId: new ObjectId(userId),
        isActive: true,
        trusted: true,
      })
      .sort({ isPrimary: -1, lastSeenAt: -1 })
      .lean();
  }

  async deactivateDevice(userId: string, deviceKey: string): Promise<void> {
    await this.model.updateOne(
      { userId: new ObjectId(userId), deviceKey },
      { $set: { isActive: false, trusted: false, lastSeenAt: new Date() } },
    );
  }

  async deactivateAllExcept(userId: string, keepDeviceKey: string): Promise<number> {
    const result = await this.model.updateMany(
      {
        userId: new ObjectId(userId),
        isActive: true,
        deviceKey: { $ne: keepDeviceKey },
      },
      { $set: { isActive: false, trusted: false, lastSeenAt: new Date() } },
    );
    return result.modifiedCount || 0;
  }

  async updatePushToken(userId: string, deviceKey: string, pushToken: string | null): Promise<boolean> {
    // Match pending (trusted:false) and trusted rows — both need FCM for consent / rejection.
    const result = await this.model.updateOne(
      { userId: new ObjectId(userId), deviceKey, isActive: true },
      {
        $set: {
          pushToken: pushToken || null,
          lastSeenAt: new Date(),
          source: 'mobile',
        },
      },
    );
    return (result.modifiedCount || 0) > 0 || (result.matchedCount || 0) > 0;
  }

  async markTrusted(userId: string, deviceKey: string): Promise<void> {
    await this.model.updateOne(
      { userId: new ObjectId(userId), deviceKey },
      { $set: { trusted: true, isActive: true, lastSeenAt: new Date(), compromisedAt: null } },
    );
  }

  async findByUserAndHardwareFingerprint(
    userId: string,
    hardwareFingerprint: string,
  ): Promise<ITrustedDevice | null> {
    if (!hardwareFingerprint) return null;
    return this.model
      .findOne({
        userId: new ObjectId(userId),
        hardwareFingerprint,
        isActive: true,
        trusted: true,
        compromisedAt: null,
      })
      .lean();
  }

  async findByTrustTokenHash(trustTokenHash: string): Promise<ITrustedDevice | null> {
    if (!trustTokenHash) return null;
    return this.model
      .findOne({ trustTokenHash, isActive: true })
      .select('+trustTokenHash')
      .lean();
  }

  async setDeviceTrustCredentials(input: {
    userId: string;
    deviceKey: string;
    trustTokenHash: string;
    trustExpiresAt: Date;
    hardwareFingerprint?: string | null;
  }): Promise<void> {
    const $set: Record<string, unknown> = {
      trustTokenHash: input.trustTokenHash,
      trustExpiresAt: input.trustExpiresAt,
      lastSeenAt: new Date(),
      compromisedAt: null,
    };
    if (input.hardwareFingerprint) {
      $set.hardwareFingerprint = input.hardwareFingerprint;
    }
    await this.model.updateOne(
      { userId: new ObjectId(input.userId), deviceKey: input.deviceKey },
      { $set },
    );
  }

  async clearDeviceTrust(userId: string, deviceKey: string): Promise<void> {
    await this.model.updateOne(
      { userId: new ObjectId(userId), deviceKey },
      { $set: { trustTokenHash: null, trustExpiresAt: null, lastSeenAt: new Date() } },
    );
  }

  async markCompromised(userId: string, deviceKey: string): Promise<void> {
    await this.model.updateOne(
      { userId: new ObjectId(userId), deviceKey },
      {
        $set: {
          compromisedAt: new Date(),
          trusted: false,
          isActive: false,
          trustTokenHash: null,
          trustExpiresAt: null,
          lastSeenAt: new Date(),
        },
      },
    );
  }

  /**
   * After reinstall the install UUID changes; keep the trusted row and retarget deviceKey.
   */
  async rebindDeviceKey(input: {
    userId: string;
    fromDeviceKey: string;
    toDeviceKey: string;
    hardwareFingerprint?: string | null;
  }): Promise<void> {
    if (!input.toDeviceKey || input.fromDeviceKey === input.toDeviceKey) return;
    const userObjectId = new ObjectId(input.userId);
    const existingTarget = await this.model
      .findOne({ userId: userObjectId, deviceKey: input.toDeviceKey })
      .lean();
    if (existingTarget) {
      // Prefer the new key row; deactivate the old one.
      await this.model.updateOne(
        { userId: userObjectId, deviceKey: input.toDeviceKey },
        {
          $set: {
            trusted: true,
            isActive: true,
            compromisedAt: null,
            lastSeenAt: new Date(),
            ...(input.hardwareFingerprint
              ? { hardwareFingerprint: input.hardwareFingerprint }
              : {}),
          },
        },
      );
      await this.model.updateOne(
        { userId: userObjectId, deviceKey: input.fromDeviceKey },
        { $set: { isActive: false, trustTokenHash: null, trustExpiresAt: null } },
      );
      return;
    }
    await this.model.updateOne(
      { userId: userObjectId, deviceKey: input.fromDeviceKey },
      {
        $set: {
          deviceKey: input.toDeviceKey,
          lastSeenAt: new Date(),
          ...(input.hardwareFingerprint
            ? { hardwareFingerprint: input.hardwareFingerprint }
            : {}),
        },
      },
    );
  }

  async findPushTokenForDevice(userId: string, deviceKey: string): Promise<string | null> {
    const row = await this.model
      .findOne({ userId: new ObjectId(userId), deviceKey })
      .select({ pushToken: 1 })
      .lean();
    const token = row?.pushToken ? String(row.pushToken) : '';
    return token.length > 0 ? token : null;
  }

  async clearPushToken(pushToken: string): Promise<void> {
    if (!pushToken) return;
    await this.model.updateMany(
      { pushToken },
      { $set: { pushToken: null, lastSeenAt: new Date() } },
    );
  }

  /** Active devices with an FCM token (explicitly selects pushToken). */
  async listPushTargets(
    userId: string,
    options?: { excludeDeviceKey?: string | null },
  ): Promise<Array<{ deviceKey: string; pushToken: string }>> {
    const filter: Record<string, unknown> = {
      userId: new ObjectId(userId),
      isActive: true,
      trusted: true,
      pushToken: { $type: 'string', $ne: '' },
    };
    if (options?.excludeDeviceKey) {
      filter.deviceKey = { $ne: options.excludeDeviceKey };
    }
    const rows = await this.model
      .find(filter)
      .select({ deviceKey: 1, pushToken: 1 })
      .lean();
    return rows
      .map((r) => ({
        deviceKey: String(r.deviceKey),
        pushToken: String(r.pushToken || ''),
      }))
      .filter((r) => r.pushToken.length > 0);
  }

  async upsertTrustedDevice(input: {
    userId: string;
    deviceKey: string;
    deviceName?: string;
    platform?: string;
    userAgent?: string;
    source?: string;
    makePrimary?: boolean;
    /** Defaults true. Pass false for pending consent on a new device. */
    trusted?: boolean;
    hardwareFingerprint?: string | null;
  }): Promise<void> {
    const now = new Date();
    const userObjectId = new ObjectId(input.userId);
    const trusted = input.trusted !== false;

    if (input.makePrimary) {
      await this.model.updateMany(
        { userId: userObjectId, isActive: true },
        { $set: { isPrimary: false } },
      );
    }

    const activeCount = await this.countActiveByUserId(input.userId);
    const filter = { userId: userObjectId, deviceKey: input.deviceKey };

    // Only set provided fields — avoid wiping name/platform with undefined on stub upserts.
    const $set: Record<string, unknown> = {
      trusted,
      isActive: true,
      lastSeenAt: now,
    };
    if (input.deviceName !== undefined) $set.deviceName = input.deviceName;
    if (input.platform !== undefined) $set.platform = input.platform;
    if (input.userAgent !== undefined) $set.userAgent = input.userAgent;
    if (input.source !== undefined) $set.source = input.source;
    if (input.hardwareFingerprint) $set.hardwareFingerprint = input.hardwareFingerprint;
    if (trusted) $set.compromisedAt = null;

    // isPrimary must not appear in both $set and $setOnInsert (Mongo upsert conflict).
    await this.model.updateOne(
      filter,
      {
        $set,
        $setOnInsert: {
          userId: userObjectId,
          deviceKey: input.deviceKey,
          isPrimary: activeCount === 0,
          createdAt: now,
        },
      },
      { upsert: true },
    );

    if (input.makePrimary) {
      await this.model.updateOne(filter, { $set: { isPrimary: true } });
    }
  }
}

let trustedDeviceRepo: TrustedDeviceRepository | null = null;
export const getTrustedDeviceRepository = (): TrustedDeviceRepository => {
  if (!trustedDeviceRepo) trustedDeviceRepo = new TrustedDeviceRepository();
  return trustedDeviceRepo;
};
