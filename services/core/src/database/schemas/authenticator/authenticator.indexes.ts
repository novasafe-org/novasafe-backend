import type { Model } from 'mongoose';
import type { IAuthenticatorEntry } from './authenticator-entry.schema';

export const applyAuthenticatorIndexes = async (
  model: Model<IAuthenticatorEntry>,
): Promise<void> => {
  await model.syncIndexes();
};
