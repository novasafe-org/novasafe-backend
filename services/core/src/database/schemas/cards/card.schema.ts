import { COLLECTIONS } from '../../collections';
import { createBaseSchema } from '../base.schema';
import { encryptionFields } from '../common/encryption.schema';
import { objectIdType } from '../common/schema-types';
import { sourceField } from '../common/source-tracking.schema';
import { userIdField } from '../common/user-reference.schema';

/** Card types shown in mobile UI (storage taxonomy — not payment rails). */
export const CARD_TYPES = ['credit', 'debit', 'prepaid', 'gift', 'loyalty', 'other'] as const;
export type CardType = (typeof CARD_TYPES)[number];

/**
 * Card document — sensitive PAN/CVV/holder/expiry/billing live in encrypted_data.
 * last4 + cardType + brand are plaintext for list tiles without full decrypt.
 */
const cardDefinition = {
  ...userIdField,
  name: { type: String, required: true },
  cardType: { type: String, enum: CARD_TYPES, default: 'credit' },
  /** Visa / Mastercard / Amex / RuPay / etc. (optional). */
  brand: { type: String, default: null },
  /** Optional UI accent color (hex), same palette as folders. */
  color: { type: String, default: null },
  /** Last 4 digits of PAN for masked list display. */
  last4: { type: String, default: null },
  folderId: { type: objectIdType, default: null, sparse: true },
  isFavorite: { type: Boolean, default: false },
  /** Stored reminder preferences only — no scheduler in v1. */
  reminders: {
    type: {
      paymentDue: { type: Boolean, default: false },
      dueDate: { type: String, default: null },
      annualFee: { type: Boolean, default: false },
      cardExpiry: { type: Boolean, default: false },
    },
    default: {},
  },
  ...encryptionFields,
  ...sourceField,
};

export const CardSchema = createBaseSchema(cardDefinition);

export const CARD_MODEL_NAME = 'Card';
export const CARD_COLLECTION = COLLECTIONS.cards;
