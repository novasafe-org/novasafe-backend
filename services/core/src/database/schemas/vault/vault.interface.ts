import type { Types } from 'mongoose';
import type { IBaseEntityDocument } from '../../core/base.entity';
import type { CustomFieldType, VaultItemCategory } from './vault.enums';

export interface IVaultItem extends IBaseEntityDocument {
  userId: Types.ObjectId;
  workspaceId?: Types.ObjectId;
  encrypted_data: string;
  iv: string;
  authTag?: string;
  algorithm?: string;
  keyVersion?: number;
  category?: VaultItemCategory | string;
  title?: string;
  folderId?: Types.ObjectId | null;
  tags?: string[];
  logoUrl?: string | null;
  isFavorite?: boolean;
  field_count?: number;
  attachment_count?: number;
  accessCount?: number;
  lastAccessedAt?: Date | null;
  deleted?: boolean;
  deleted_at?: Date | null;
  source?: string;
  sync_status?: string;
  synced_at?: Date;
  local_version?: number;
  cloud_version?: number;
  device_id?: string | null;
}

export interface IPasswordHistory extends IBaseEntityDocument {
  userId: Types.ObjectId;
  credentialId: Types.ObjectId;
  encrypted_data: string;
  iv: string;
  authTag?: string;
  is_expired: boolean;
  source?: string;
  deleted?: boolean;
}

export interface ICustomField extends IBaseEntityDocument {
  userId: Types.ObjectId;
  credentialId: Types.ObjectId;
  field_label: string;
  field_type: CustomFieldType | string;
  is_sensitive: boolean;
  field_value?: string | null;
  encrypted_data?: string | null;
  iv?: string | null;
  authTag?: string | null;
  source?: string;
  deleted?: boolean;
}

/** Future: hierarchical folders (collection reserved). */
export interface IVaultFolder extends IBaseEntityDocument {
  userId: Types.ObjectId;
  name: string;
  parentId?: Types.ObjectId | null;
  source?: string;
}
