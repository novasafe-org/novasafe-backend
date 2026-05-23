import type { Model } from 'mongoose';
import type { IExportHistory } from './export-history.schema';

export const EXPORT_HISTORY_INDEX_SPECS = [{ key: { userId: 1, createdAt: -1 } }] as const;

export const applyAuditIndexes = async (exportModel: Model<IExportHistory>): Promise<void> => {
  await exportModel.syncIndexes();
};
