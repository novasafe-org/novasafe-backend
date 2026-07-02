import type { FeatureFlagEnvironment, FeatureFlagKey } from '@novasafe/feature-flags';
import type { ObjectId } from 'mongodb';

export type FeatureFlagAuditAction = 'toggle' | 'bulk_update';

export interface FeatureFlagRecord {
  _id: ObjectId;
  key: FeatureFlagKey;
  environment: FeatureFlagEnvironment;
  enabled: boolean;
  rolloutPercent: number;
  allowedUserIds: string[];
  version: number;
  updatedBy?: string;
  updatedByEmail?: string;
  updatedAt: Date;
  createdAt: Date;
}

export interface FeatureFlagAuditRecord {
  _id: ObjectId;
  key: FeatureFlagKey;
  environment: FeatureFlagEnvironment;
  action: FeatureFlagAuditAction;
  oldValue: { enabled: boolean };
  newValue: { enabled: boolean };
  actorId: string;
  actorEmail: string;
  note?: string | null;
  createdAt: Date;
}

/** DataTable-friendly row for admin panel (NS-64). */
export interface FeatureFlagRowDto {
  key: FeatureFlagKey;
  displayName: string;
  description: string;
  owner: string;
  category: string;
  tier: string;
  lifecycle: string;
  clientSurfaces: string[];
  environment: FeatureFlagEnvironment;
  enabled: boolean;
  catalogDefault: boolean;
  version: number;
  updatedAt: string | null;
  updatedBy: string | null;
  updatedByEmail: string | null;
}

export interface FeatureFlagSnapshotDto {
  catalogVersion: string;
  storeVersion: number;
  environment: FeatureFlagEnvironment;
  flags: Record<FeatureFlagKey, boolean>;
}
