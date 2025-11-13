import dotenv from 'dotenv';

dotenv.config();

export const DBCONFIG: Record<string, any> = {
  vault: {
    type: 'mongodb',
    uri: `mongodb+srv://vaultatlasdbuser:TGExCm3gURQg7mvg@vault-cluster.chu49ca.mongodb.net/vault?retryWrites=true&w=majority`,
    databaseName: process.env.VAULT_DB_NAME || 'vault',
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