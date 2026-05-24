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

  async upsertTrustedDevice(input: {
    userId: string;
    deviceKey: string;
    deviceName?: string;
    platform?: string;
    userAgent?: string;
    source?: string;
    makePrimary?: boolean;
  }): Promise<void> {
    const now = new Date();
    const userObjectId = new ObjectId(input.userId);

    if (input.makePrimary) {
      await this.model.updateMany(
        { userId: userObjectId, isActive: true },
        { $set: { isPrimary: false } },
      );
    }

    const activeCount = await this.countActiveByUserId(input.userId);
    const filter = { userId: userObjectId, deviceKey: input.deviceKey };

    // isPrimary must not appear in both $set and $setOnInsert (Mongo upsert conflict).
    await this.model.updateOne(
      filter,
      {
        $set: {
          deviceName: input.deviceName,
          platform: input.platform,
          userAgent: input.userAgent,
          source: input.source,
          trusted: true,
          isActive: true,
          lastSeenAt: now,
        },
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
