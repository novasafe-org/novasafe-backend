/**
 * One-time (idempotent) migration for production backward compatibility.
 * Seeds `devices` from all historical `sessions` so existing users keep trusted devices
 * after Free-plan device limits apply.
 *
 * Run from services/mobile_vault (with .env pointing at production/staging Atlas):
 *   pnpm run migrate:trusted-devices
 *   pnpm run migrate:trusted-devices -- --dry-run
 */
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import path from 'node:path';
import { MongoClient, ObjectId } from 'mongodb';
import { DB_CONFIG } from '../config/dbConfig';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const DEVICES = DB_CONFIG.collections.devices;
const SESSIONS = DB_CONFIG.collections.sessions;

const sanitizeDeviceKey = (value: string): string =>
  value.trim().slice(0, 128).replace(/[^\w.\-:@+/=]/g, '_');

const legacySessionFingerprint = (platform: string, userAgent: string): string =>
  crypto.createHash('sha256').update(`${platform}|${userAgent}`).digest('hex').slice(0, 40);

const fullDeviceFingerprint = (platform: string, userAgent: string, deviceName: string): string =>
  crypto.createHash('sha256').update(`${platform}|${userAgent}|${deviceName}`).digest('hex').slice(0, 40);

const sessionDeviceKeys = (row: Record<string, unknown>): string[] => {
  const platform = String(row.platform || 'unknown');
  const userAgent = String(row.userAgent || '');
  const deviceName = String(row.deviceName || '');
  const keys = new Set<string>();
  const deviceId = row.deviceId ? String(row.deviceId) : '';
  if (deviceId) keys.add(sanitizeDeviceKey(deviceId));
  keys.add(legacySessionFingerprint(platform, userAgent));
  if (deviceName) keys.add(fullDeviceFingerprint(platform, userAgent, deviceName));
  return [...keys];
};

const dryRun = process.argv.includes('--dry-run');

async function main(): Promise<void> {
  const client = new MongoClient(DB_CONFIG.uri, { retryReads: true, retryWrites: true, family: 4 });
  await client.connect();
  const database = client.db(DB_CONFIG.databaseName);
  const sessionsCol = database.collection(SESSIONS);
  const devicesCol = database.collection(DEVICES);

  await devicesCol.createIndex({ userId: 1, deviceKey: 1 }, { unique: true, name: 'userId_deviceKey_unique' });
  await devicesCol.createIndex({ userId: 1, isActive: 1, trusted: 1 }, { name: 'userId_active_trusted' });

  const userIds = await sessionsCol.distinct('userId', { userId: { $exists: true, $ne: null } });
  console.log(`Found ${userIds.length} users with session history${dryRun ? ' (dry-run)' : ''}.`);

  let usersUpdated = 0;
  let devicesUpserted = 0;
  const now = new Date();

  for (const userId of userIds) {
    const uid = userId instanceof ObjectId ? userId : new ObjectId(String(userId));
    const sessions = await sessionsCol
      .find({ userId: uid })
      .sort({ lastActivity: -1, createdAt: -1 })
      .limit(500)
      .toArray();

    const seen = new Set<string>();
    let index = 0;
    let userDeviceCount = 0;

    for (const row of sessions) {
      const record = row as Record<string, unknown>;
      for (const key of sessionDeviceKeys(record)) {
      if (seen.has(key)) continue;
      seen.add(key);
      index += 1;
      userDeviceCount += 1;

      if (!dryRun) {
        await devicesCol.updateOne(
          { userId: uid, deviceKey: key },
          {
            $set: {
              deviceName: String((row as { deviceName?: string }).deviceName || 'Unknown Device'),
              platform: String((row as { platform?: string }).platform || 'unknown'),
              userAgent: String((row as { userAgent?: string }).userAgent || ''),
              source: String((row as { source?: string }).source || 'mobile'),
              trusted: true,
              isActive: true,
              lastSeenAt: now,
              updatedAt: now,
            },
            $setOnInsert: {
              userId: uid,
              deviceKey: key,
              isPrimary: index === 1,
              createdAt: now,
            },
          },
          { upsert: true },
        );
      }
      devicesUpserted += 1;
      }
    }

    if (userDeviceCount > 0) usersUpdated += 1;
  }

  console.log(
    dryRun
      ? `Dry-run complete: would upsert ~${devicesUpserted} device rows for ${usersUpdated} users.`
      : `Migration complete: upserted ${devicesUpserted} device rows for ${usersUpdated} users.`,
  );

  await client.close();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
