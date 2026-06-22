import { MongoClient, Db, ObjectId } from 'mongodb';
import { logger } from '../shared/logger';

let client: MongoClient | null = null;
let db: Db | null = null;

function buildUri(): string {
  const user = process.env.MONGODB_USERNAME?.trim();
  const pass = process.env.MONGODB_PASSWORD?.trim();
  const host = process.env.MONGODB_HOST?.trim();
  const dbName = process.env.DATABASE_NAME?.trim() || 'novasafe';

  if (!user || !pass || !host) {
    throw new Error('MongoDB env vars missing (MONGODB_USERNAME, MONGODB_PASSWORD, MONGODB_HOST)');
  }

  const encodedUser = encodeURIComponent(user);
  const encodedPass = encodeURIComponent(pass);
  return `mongodb+srv://${encodedUser}:${encodedPass}@${host}/${dbName}?retryWrites=true&w=majority`;
}

export async function connectMongo(): Promise<Db> {
  if (db) return db;
  const uri = buildUri();
  client = new MongoClient(uri);
  await client.connect();
  db = client.db(process.env.DATABASE_NAME?.trim() || 'novasafe');
  logger.info('Admin-app MongoDB connected', { db: db.databaseName });
  return db;
}

export async function disconnectMongo(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}

export function getDb(): Db {
  if (!db) throw new Error('MongoDB not connected');
  return db;
}

export { ObjectId };

export const ADMIN_COLLECTIONS = {
  users: 'admin_users',
  roles: 'admin_roles',
  permissions: 'admin_permissions',
  rolePermissions: 'admin_role_permissions',
  invites: 'admin_invites',
  passwordResets: 'admin_password_resets',
  changelog: 'changelog_releases',
} as const;
