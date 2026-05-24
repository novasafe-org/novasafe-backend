import { Schema } from 'mongoose';
import { COLLECTIONS } from '../../collections';
import { createBaseSchema } from '../base.schema';
import { deviceInfoFields } from '../common/device-info.schema';
import { sourceField } from '../common/source-tracking.schema';
import { userIdField } from '../common/user-reference.schema';
import type { ITrustedDevice } from './device.interface';

const deviceDefinition = {
  ...userIdField,
  deviceKey: { type: String, required: true, trim: true },
  ...deviceInfoFields,
  trusted: { type: Boolean, default: true },
  isPrimary: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  lastSeenAt: { type: Date, default: Date.now },
  pushToken: { type: String, default: null, select: false },
  ...sourceField,
};

export const DeviceSchema = createBaseSchema(deviceDefinition);

DeviceSchema.index({ userId: 1, deviceKey: 1 }, { unique: true });
DeviceSchema.index({ userId: 1, isActive: 1, lastSeenAt: -1 });

export const DEVICE_MODEL_NAME = 'TrustedDevice';
export const DEVICE_COLLECTION = COLLECTIONS.devices;
