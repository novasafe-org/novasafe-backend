import { Schema } from 'mongoose';

export enum SharePermission {
  Viewer = 'Viewer',
  Editor = 'Editor',
  Admin = 'Admin',
}

export const sharingPermissionField = {
  permission: {
    type: String,
    enum: Object.values(SharePermission),
    default: SharePermission.Viewer,
  },
} as const;

export const SharingPermissionSchema = new Schema(sharingPermissionField, { _id: false });
