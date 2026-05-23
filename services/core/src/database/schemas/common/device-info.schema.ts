import { Schema } from 'mongoose';

export const deviceInfoFields = {
  deviceName: { type: String, default: null },
  platform: { type: String, default: null },
  userAgent: { type: String, default: null },
  ipAddress: { type: String, default: null },
  locationLabel: { type: String, default: null },
} as const;

export const DeviceInfoSchema = new Schema(deviceInfoFields, { _id: false });
