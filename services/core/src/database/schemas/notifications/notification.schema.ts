import { COLLECTIONS } from '../../collections';
import { createBaseSchema } from '../base.schema';
import { sourceField } from '../common/source-tracking.schema';
import { userIdField } from '../common/user-reference.schema';

/** Placeholder in-app / push notification records. */
const notificationDefinition = {
  ...userIdField,
  channel: { type: String, enum: ['email', 'push', 'in_app'], default: 'in_app' },
  title: { type: String, required: true },
  body: { type: String, default: null },
  read: { type: Boolean, default: false, index: true },
  readAt: { type: Date, default: null },
  ...sourceField,
};

export const NotificationSchema = createBaseSchema(notificationDefinition);

NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

export const NOTIFICATION_MODEL_NAME = 'Notification';
export const NOTIFICATION_COLLECTION = COLLECTIONS.notifications;
