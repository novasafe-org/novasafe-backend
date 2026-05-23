import { Schema, Types } from 'mongoose';
import type { IBaseEntityDocument } from '../../core/base.entity';
import { COLLECTIONS } from '../../collections';
import { createBaseSchema } from '../base.schema';
import { sourceField } from '../common/source-tracking.schema';
import { userIdField } from '../common/user-reference.schema';

export enum ExportFormat {
  Csv = 'csv',
  Json = 'json',
}

export enum ExportStatus {
  Pending = 'pending',
  Completed = 'completed',
  Failed = 'failed',
}

export interface IExportHistory extends IBaseEntityDocument {
  userId: Types.ObjectId;
  format: ExportFormat | string;
  status: ExportStatus | string;
  itemCount?: number;
  fileName?: string;
  payload?: string;
  source?: string;
}

const exportHistoryDefinition = {
  ...userIdField,
  format: { type: String, default: ExportFormat.Csv },
  status: { type: String, default: ExportStatus.Completed, index: true },
  itemCount: { type: Number, default: 0 },
  fileName: { type: String, default: null },
  payload: { type: String, default: null, select: false },
  ...sourceField,
};

export const ExportHistorySchema = createBaseSchema(exportHistoryDefinition);

ExportHistorySchema.index({ userId: 1, createdAt: -1 });

export const EXPORT_HISTORY_MODEL_NAME = 'ExportHistory';
export const EXPORT_HISTORY_COLLECTION = COLLECTIONS.exportHistory;
