/**
 * Settings Model Interface
 * 
 * Represents user settings/preferences stored in MongoDB.
 * This interface defines the structure of user settings documents.
 */

export interface ISettings {
  /**
   * MongoDB ObjectId of the user (references User collection)
   */
  userId: string;

  /**
   * Security & Privacy settings
   */
  security: {
    biometricUnlock: boolean;
    autoLockTimer: number; // in minutes
    twoFactor: boolean;
    hideSensitive: boolean;
    clearClipboard: number; // delay in seconds (0 = disabled)
  };

  /**
   * Appearance settings
   */
  appearance: {
    theme: string; // 'light' | 'dark' | 'classic' | 'amoled'
    accentColor: string; // HSL color value
    iconStyle: string; // 'flat' | 'colorful' | 'minimal'
    compactMode: boolean;
  };

  /**
   * Notification settings
   */
  notifications: {
    activityAlerts: boolean;
    failedLoginAlerts: boolean;
    summary: string; // 'daily' | 'weekly' | 'off'
  };

  /**
   * App behavior settings
   */
  behavior: {
    language: string; // language code (e.g., 'en', 'hi', 'mr')
    timeFormat: string; // '12' | '24'
    pullToRefresh: boolean;
  };

  /**
   * Advanced settings
   */
  advanced: {
    betaFeatures: boolean;
    apiEndpoint: string; // developer mode endpoint
  };

  /**
   * Timestamp of when settings were created
   */
  createdAt: Date;

  /**
   * Timestamp of last update to settings
   */
  updatedAt: Date;

  /**
   * MongoDB's ObjectId (auto-generated)
   */
  _id?: any;
}

/**
 * Default Settings
 * Used when creating new user settings
 */
export const DEFAULT_SETTINGS: Omit<ISettings, 'userId' | '_id' | 'createdAt' | 'updatedAt'> = {
  security: {
    biometricUnlock: false,
    autoLockTimer: 5, // 5 minutes
    twoFactor: false,
    hideSensitive: true,
    clearClipboard: 30, // 30 seconds
  },
  appearance: {
    theme: 'light',
    accentColor: '174 84% 32%', // Default Emerald Teal
    iconStyle: 'colorful',
    compactMode: false,
  },
  notifications: {
    activityAlerts: true,
    failedLoginAlerts: true,
    summary: 'weekly',
  },
  behavior: {
    language: 'en',
    timeFormat: '12',
    pullToRefresh: true,
  },
  advanced: {
    betaFeatures: false,
    apiEndpoint: '',
  },
};

