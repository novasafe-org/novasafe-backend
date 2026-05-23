import { Schema } from 'mongoose';

export enum ClientSource {
  Mobile = 'mobile',
  Web = 'web',
  Extension = 'extension',
  Admin = 'admin',
  System = 'system',
}

export const sourceField = {
  source: {
    type: String,
    enum: Object.values(ClientSource),
    default: ClientSource.Mobile,
  },
} as const;

export const syncFields = {
  sync_status: { type: String, default: 'synced' },
  synced_at: { type: Date, default: null },
  local_version: { type: Number, default: 1 },
  cloud_version: { type: Number, default: 1 },
  device_id: { type: String, default: null },
} as const;

export const SourceTrackingSchema = new Schema(
  { ...sourceField, ...syncFields },
  { _id: false },
);
