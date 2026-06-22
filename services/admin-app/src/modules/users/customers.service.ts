import { getDb, ObjectId } from '../../database/mongo';

import { VAULT_COLLECTIONS, type SubscriptionState } from './vault-collections';

export type CustomerUser = {
  id: string;
  name: string;
  email: string;
  plan: string;
  status: 'active' | 'suspended' | 'invited';
  country: string;
  devices: number;
  vaultItems: number;
  twoFA: boolean;
  securityScore: number;
  lastLogin: string | null;
  createdAt: string;
};

export type ListCustomersParams = {
  page?: number;
  limit?: number;
  q?: string;
  status?: string;
  plan?: string;
};

function mapPlan(state: SubscriptionState | null | undefined): string {
  if (!state || state.tier !== 'pro' || (!state.isActive && !state.inGracePeriod)) {
    return 'Free';
  }
  const productId = (state.productId || '').toLowerCase();
  if (productId.includes('lifetime')) return 'Lifetime';
  if (productId.includes('year') || productId.includes('annual')) return 'Pro Yearly';
  if (productId.includes('month')) return 'Pro Monthly';
  return 'Pro Monthly';
}

function mapStatus(user: Record<string, unknown>): CustomerUser['status'] {
  if (user.deleted === true) return 'suspended';
  if (!user.email_verified && !user.has_password && !user.googleId && !user.appleId) {
    return 'invited';
  }
  return 'active';
}

function securityScore(user: Record<string, unknown>, state: SubscriptionState | null | undefined): number {
  let score = 40;
  if (user.twoFactorEnabled) score += 25;
  if (user.email_verified || user.novasafeEmailVerified) score += 15;
  if (user.has_password) score += 10;
  if (state?.isPro) score += 10;
  return Math.min(100, score);
}

function displayName(user: Record<string, unknown>): string {
  const name = String(user.name || '').trim();
  if (name) return name;
  const email = String(user.email || '');
  return email.split('@')[0] || 'User';
}

export async function listCustomers(params: ListCustomersParams = {}): Promise<{
  items: CustomerUser[];
  total: number;
  page: number;
  limit: number;
}> {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 25));
  const skip = (page - 1) * limit;
  const db = getDb();

  const filter: Record<string, unknown> = {};
  if (params.status === 'suspended') {
    filter.deleted = true;
  } else if (params.status === 'invited') {
    filter.deleted = { $ne: true };
    filter.email_verified = { $ne: true };
    filter.has_password = { $ne: true };
    filter.googleId = null;
    filter.appleId = null;
  } else {
    filter.deleted = { $ne: true };
  }

  if (params.q?.trim()) {
    const q = params.q.trim();
    filter.$or = [
      { email: { $regex: q, $options: 'i' } },
      { name: { $regex: q, $options: 'i' } },
    ];
  }

  const collection = db.collection(VAULT_COLLECTIONS.vaultUsers);
  const [users, total] = await Promise.all([
    collection.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).toArray(),
    collection.countDocuments(filter),
  ]);

  if (users.length === 0) {
    return { items: [], total, page, limit };
  }

  const userIds = users.map((u) => u._id as ObjectId);

  const [subscriptions, deviceCounts, vaultCounts, lastActivities] = await Promise.all([
    db.collection(VAULT_COLLECTIONS.subscriptions).find({ userId: { $in: userIds } }).toArray(),
    db
      .collection(VAULT_COLLECTIONS.devices)
      .aggregate<{ _id: ObjectId; count: number }>([
        { $match: { userId: { $in: userIds } } },
        { $group: { _id: '$userId', count: { $sum: 1 } } },
      ])
      .toArray(),
    db
      .collection(VAULT_COLLECTIONS.vaultItems)
      .aggregate<{ _id: ObjectId; count: number }>([
        { $match: { userId: { $in: userIds }, deleted: { $ne: true } } },
        { $group: { _id: '$userId', count: { $sum: 1 } } },
      ])
      .toArray(),
    db
      .collection(VAULT_COLLECTIONS.sessions)
      .aggregate<{ _id: ObjectId; lastActivity: Date }>([
        { $match: { userId: { $in: userIds } } },
        { $group: { _id: '$userId', lastActivity: { $max: '$lastActivity' } } },
      ])
      .toArray(),
  ]);

  const subByUser = new Map(
    subscriptions.map((s) => [String(s.userId), s.state as SubscriptionState | undefined]),
  );
  const devicesByUser = new Map(deviceCounts.map((d) => [String(d._id), d.count]));
  const vaultByUser = new Map(vaultCounts.map((v) => [String(v._id), v.count]));
  const activityByUser = new Map(lastActivities.map((a) => [String(a._id), a.lastActivity]));

  let items = users.map((user) => {
    const id = String(user._id);
    const state = subByUser.get(id);
    const lastActivity = activityByUser.get(id);
    const lastLogin = lastActivity
      ? new Date(lastActivity).toISOString()
      : user.updatedAt
        ? new Date(user.updatedAt as Date).toISOString()
        : null;

    return {
      id,
      name: displayName(user),
      email: String(user.email || ''),
      plan: mapPlan(state),
      status: mapStatus(user),
      country: String((user as { country?: string }).country || '—'),
      devices: devicesByUser.get(id) ?? 0,
      vaultItems: vaultByUser.get(id) ?? 0,
      twoFA: Boolean(user.twoFactorEnabled),
      securityScore: securityScore(user, state),
      lastLogin,
      createdAt: user.createdAt ? new Date(user.createdAt as Date).toISOString() : new Date().toISOString(),
    };
  });

  if (params.plan) {
    items = items.filter((u) => u.plan === params.plan);
  }

  return { items, total: params.plan ? items.length : total, page, limit };
}

export async function getCustomerById(id: string): Promise<CustomerUser | null> {
  if (!ObjectId.isValid(id)) return null;
  const db = getDb();
  const user = await db.collection(VAULT_COLLECTIONS.vaultUsers).findOne({ _id: new ObjectId(id) });
  if (!user) return null;

  const userId = new ObjectId(id);
  const [subscription, deviceCount, vaultCount, lastActivity] = await Promise.all([
    db.collection(VAULT_COLLECTIONS.subscriptions).findOne({ userId }),
    db.collection(VAULT_COLLECTIONS.devices).countDocuments({ userId }),
    db.collection(VAULT_COLLECTIONS.vaultItems).countDocuments({ userId, deleted: { $ne: true } }),
    db
      .collection(VAULT_COLLECTIONS.sessions)
      .find({ userId })
      .sort({ lastActivity: -1 })
      .limit(1)
      .toArray(),
  ]);

  const state = subscription?.state as SubscriptionState | undefined;
  const last = lastActivity[0]?.lastActivity as Date | undefined;

  return {
    id,
    name: displayName(user),
    email: String(user.email || ''),
    plan: mapPlan(state),
    status: mapStatus(user),
    country: String((user as { country?: string }).country || '—'),
    devices: deviceCount,
    vaultItems: vaultCount,
    twoFA: Boolean(user.twoFactorEnabled),
    securityScore: securityScore(user, state),
    lastLogin: last ? new Date(last).toISOString() : user.updatedAt ? new Date(user.updatedAt as Date).toISOString() : null,
    createdAt: user.createdAt ? new Date(user.createdAt as Date).toISOString() : new Date().toISOString(),
  };
}
