import dotenv from 'dotenv';
import { DBConfigGeneric } from './types';

dotenv.config();

export const DBCONFIG: Record<string, DBConfigGeneric<Record<string, string>>> = {
  vault: {
    type: 'mongodb',
    databaseName: process.env.VAULT_DB_NAME || 'vault',
    host: process.env.VAULT_DB_HOST,
    port: process.env.VAULT_DB_PORT || 27017,
    uri: `mongodb+srv://${process.env.VAULT_DB_USERNAME}:${process.env.VAULT_DB_PASSWORD}@${process.env.VAULT_DB_HOST}/${process.env.VAULT_DB_NAME}?retryWrites=true&w=majority`,
    collections: {
      // Existing collections
      users: 'users',
      vaultItems: 'vaultItems',
      vaultUsers: 'vaultUsers',
      folders: 'folders',
      // New collections (Level 3, 4, 5)
      sessions: 'sessions',
      auditLogs: 'audit_logs',
      securityEvents: 'security_events',
      passwordBreaches: 'password_breaches',
      // Sharing collections
      shares: 'shares',
      userKeys: 'userKeys',
    }
  }
};