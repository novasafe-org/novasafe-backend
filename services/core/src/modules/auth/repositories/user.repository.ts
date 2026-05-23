import type { FilterQuery, Model, UpdateQuery } from 'mongoose';
import { Types } from 'mongoose';
import { ModelRegistry } from '../../../database';
import type { IVaultUser } from '../../../database/schemas/users';
import { VAULT_USER_MODEL_NAME } from '../../../database/schemas/users';
import type { VaultOAuthUserRow } from '../types/auth.types';

const activeUserFilter = { deleted: { $ne: true } };

export class UserRepository {
  constructor(
    private readonly model: Model<IVaultUser> = ModelRegistry.get<IVaultUser>(VAULT_USER_MODEL_NAME),
  ) {}

  async findByEmail(email: string, includePassword = false): Promise<VaultOAuthUserRow | null> {
    const q = this.model.findOne({ email, ...activeUserFilter });
    if (includePassword) q.select('+passwordHash');
    return q.lean() as Promise<VaultOAuthUserRow | null>;
  }

  async findByEmailAny(email: string): Promise<VaultOAuthUserRow | null> {
    return this.model.findOne({ email }).lean() as Promise<VaultOAuthUserRow | null>;
  }

  async findByIdActive(id: string): Promise<VaultOAuthUserRow | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.model
      .findOne({ _id: id, ...activeUserFilter })
      .lean() as Promise<VaultOAuthUserRow | null>;
  }

  async findOAuthUser(filter: FilterQuery<IVaultUser>): Promise<VaultOAuthUserRow | null> {
    return this.model.findOne({ ...filter, ...activeUserFilter }).lean() as Promise<VaultOAuthUserRow | null>;
  }

  async create(data: Record<string, unknown>): Promise<VaultOAuthUserRow> {
    const doc = await this.model.create(data);
    return doc.toObject() as VaultOAuthUserRow;
  }

  async updateById(id: string, update: UpdateQuery<IVaultUser>): Promise<void> {
    await this.model.updateOne({ _id: id }, update);
  }

  async restoreDeletedAccount(id: string, fields: Record<string, unknown>): Promise<void> {
    await this.model.updateOne({ _id: id }, { $set: fields });
  }
}

let userRepo: UserRepository | null = null;
export const getUserRepository = (): UserRepository => {
  if (!userRepo) userRepo = new UserRepository();
  return userRepo;
};
