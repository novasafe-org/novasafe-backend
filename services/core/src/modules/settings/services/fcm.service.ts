import { readFileSync } from 'fs';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';
import { logger } from '../../../shared/logger';

type ServiceAccountJson = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

let messaging: Messaging | null | undefined;

const loadServiceAccount = (): ServiceAccountJson | null => {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (rawJson) {
    try {
      return JSON.parse(rawJson) as ServiceAccountJson;
    } catch (error) {
      logger.error('FIREBASE_SERVICE_ACCOUNT_JSON is invalid JSON', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()
    || process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  if (!path) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as ServiceAccountJson;
  } catch (error) {
    logger.error('Failed to read Firebase service account file', {
      path,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

const getMessagingClient = (): Messaging | null => {
  if (messaging !== undefined) return messaging;

  if (process.env.FCM_ENABLED === 'false' || process.env.FCM_ENABLED === '0') {
    messaging = null;
    return messaging;
  }

  try {
    let app: App;
    if (getApps().length > 0) {
      app = getApps()[0]!;
    } else {
      const sa = loadServiceAccount();
      if (!sa?.client_email || !sa.private_key) {
        logger.warn('FCM disabled: set FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS');
        messaging = null;
        return messaging;
      }
      app = initializeApp({
        credential: cert({
          projectId: sa.project_id,
          clientEmail: sa.client_email,
          privateKey: sa.private_key.replace(/\\n/g, '\n'),
        }),
        projectId: sa.project_id || process.env.FIREBASE_PROJECT_ID || 'novasafe-vault-app',
      });
    }
    messaging = getMessaging(app);
    logger.info('Firebase Cloud Messaging initialized');
    return messaging;
  } catch (error) {
    logger.error('Failed to initialize Firebase Admin for FCM', {
      error: error instanceof Error ? error.message : String(error),
    });
    messaging = null;
    return messaging;
  }
};

/** Basic FCM registration-token shape check (opaque string from client). */
export const isValidFcmToken = (token: unknown): token is string => {
  if (typeof token !== 'string') return false;
  const t = token.trim();
  if (t.length < 80 || t.length > 4096) return false;
  // FCM tokens are base64url-ish / URL-safe; reject obvious junk.
  return /^[A-Za-z0-9_:\-.=]+$/.test(t);
};

export type PushPayload = {
  title: string;
  body: string;
  data: Record<string, string>;
};

/**
 * Send a data+notification message to one or more device tokens.
 * Invalid / unregistered tokens are returned so callers can clear them.
 */
export const sendFcmToTokens = async (
  tokens: string[],
  payload: PushPayload,
): Promise<{ successCount: number; failureCount: number; invalidTokens: string[] }> => {
  // FCM multicast hard limit is 500 tokens per request.
  const unique = [...new Set(tokens.map((t) => t.trim()).filter(isValidFcmToken))].slice(0, 500);
  if (unique.length === 0) {
    return { successCount: 0, failureCount: 0, invalidTokens: [] };
  }

  const client = getMessagingClient();
  if (!client) {
    return { successCount: 0, failureCount: unique.length, invalidTokens: [] };
  }

  const title = String(payload.title || 'NovaSafe').slice(0, 200);
  const body = String(payload.body || '').slice(0, 1000);
  // FCM data payload values must be strings.
  const data: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload.data || {})) {
    if (value == null) continue;
    data[String(key)] = String(value);
  }

  try {
    const response = await client.sendEachForMulticast({
      tokens: unique,
      notification: {
        title,
        body,
      },
      data,
      android: {
        priority: 'high',
        notification: {
          channelId: 'novasafe_security',
          priority: 'high',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            contentAvailable: true,
          },
        },
      },
    });

    const invalidTokens: string[] = [];
    response.responses.forEach((res, i) => {
      if (res.success) return;
      const code = res.error?.code || '';
      if (
        code.includes('registration-token-not-registered') ||
        code.includes('invalid-argument') ||
        code.includes('invalid-registration-token')
      ) {
        invalidTokens.push(unique[i]!);
      } else {
        logger.warn('FCM send failed for token', {
          code,
          message: res.error?.message,
        });
      }
    });

    logger.info('FCM multicast sent', {
      successCount: response.successCount,
      failureCount: response.failureCount,
      invalidCount: invalidTokens.length,
      type: data.type,
    });

    return {
      successCount: response.successCount,
      failureCount: response.failureCount,
      invalidTokens,
    };
  } catch (error) {
    logger.error('FCM multicast error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { successCount: 0, failureCount: unique.length, invalidTokens: [] };
  }
};
