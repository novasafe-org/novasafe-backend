import dotenv from 'dotenv';

dotenv.config();

export const DB_CONFIG = {
  databaseName: process.env.VAULT_DB_NAME || 'vault',
  uri: `mongodb+srv://${process.env.VAULT_DB_USERNAME}:${process.env.VAULT_DB_PASSWORD}@${process.env.VAULT_DB_HOST}/${process.env.VAULT_DB_NAME}?retryWrites=true&w=majority`,
  collections: {
    vaultItems: 'vaultItems',
    vaultUsers: 'vaultUsers',
    sessions: 'sessions',
    passwordVersions: 'mobilePasswordVersions',
    customFields: 'mobileCustomFields',
    otpCodes: 'mobileOtpCodes',
    twoFactorChallenges: 'mobileTwoFactorChallenges',
    exportHistory: 'mobileExportHistory',
    shareRecords: 'mobileShareRecords',
    subscriptions: 'mobileSubscriptions',
    subscriptionEvents: 'mobileSubscriptionEvents',
    entitlements: 'mobileEntitlements',
    purchaseHistory: 'mobilePurchaseHistory',
  },
};
