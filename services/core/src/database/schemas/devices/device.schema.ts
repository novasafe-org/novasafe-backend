/**
 * Device metadata is embedded on {@link ISession} via `device-info.schema`.
 * Standalone device registry — reserved for future device trust / push targets.
 */
import { Schema } from 'mongoose';
import { createBaseSchema } from '../base.schema';
import { deviceInfoFields } from '../common/device-info.schema';
import { sourceField } from '../common/source-tracking.schema';
import { userIdField } from '../common/user-reference.schema';

const deviceDefinition = {
  ...userIdField,
  ...deviceInfoFields,
  trusted: { type: Boolean, default: false },
  lastSeenAt: { type: Date, default: null },
  pushToken: { type: String, default: null, select: false },
  ...sourceField,
};

export const DeviceSchema = createBaseSchema(deviceDefinition);

export const DEVICE_MODEL_NAME = 'Device';
export const DEVICE_COLLECTION = 'devices';
