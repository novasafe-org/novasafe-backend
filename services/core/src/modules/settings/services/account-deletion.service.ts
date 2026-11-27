import { ObjectId } from '../../../database/object-id';
import { COLLECTIONS } from '../../../database/collections';
import { getNativeMongo } from '../../../database/adapters/native-mongo.adapter';

const db = getNativeMongo();

export type AccountDeletionSource = 'mobile' | 'web' | 'web_email';

/**
 * Soft-deletes the vault user, marks vault items deleted, and revokes sessions.
 * Same cleanup the authenticated mobile/web settings delete-account path uses.
 */
export async function performAccountDeletion(
  userObjectId: ObjectId,
  source: AccountDeletionSource = 'mobile',
): Promise<void> {
  const now = new Date();
  await Promise.all([
    db.updateOne(
      COLLECTIONS.vaultUsers,
      { _id: userObjectId },
      { $set: { deleted: true, deletedAt: now, source } },
    ),
    db.getDb().collection(COLLECTIONS.vaultItems).updateMany(
      { userId: userObjectId, deleted: { $ne: true } },
      { $set: { deleted: true, deleted_at: now, source } },
    ),
    db.getDb().collection(COLLECTIONS.sessions).updateMany(
      { userId: userObjectId, revoked: { $ne: true } },
      { $set: { revoked: true, revokedAt: now, source } },
    ),
  ]);
}

export async function findActiveUserByEmail(emailRaw: string) {
  const email = emailRaw.toLowerCase().trim();
  if (!email) return null;
  return db.findOne(COLLECTIONS.vaultUsers, {
    email,
    deleted: { $ne: true },
  });
}
