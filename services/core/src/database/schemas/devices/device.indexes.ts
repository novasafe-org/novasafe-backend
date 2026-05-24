import type { Model } from 'mongoose';
import type { ITrustedDevice } from './device.interface';

export const applyDeviceIndexes = async (model: Model<ITrustedDevice>): Promise<void> => {
  await model.syncIndexes();
};
