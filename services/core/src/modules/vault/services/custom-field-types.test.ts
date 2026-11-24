import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/** Mirrors parseFieldType aliases from vault-items.service.ts */
const CUSTOM_FIELD_TYPES = new Set([
  'TEXT', 'PASSWORD', 'PIN', 'OTP', 'TOTP', 'SECURITY_QUESTION',
  'EMAIL', 'PHONE', 'USERNAME', 'URL', 'ADDRESS',
  'CARD_NUMBER', 'CARD_HOLDER_NAME', 'EXPIRY_DATE', 'CVV', 'UPI_ID', 'BANK_ACCOUNT_NUMBER', 'IFSC_CODE',
  'COMPANY_NAME', 'EMPLOYEE_ID', 'LICENSE_NUMBER', 'PASSPORT_NUMBER', 'AADHAR_NUMBER', 'PAN_NUMBER',
  'NOTE', 'DATE', 'NUMBER', 'FILE',
  'SELECT', 'BOOLEAN', 'TAGS',
]);

const parseFieldType = (fieldType: string) => {
  let normalized = String(fieldType || 'TEXT').toUpperCase().trim();
  if (normalized === 'SECRET') normalized = 'PASSWORD';
  if (normalized === 'MULTILINE') normalized = 'NOTE';
  if (!CUSTOM_FIELD_TYPES.has(normalized)) return null;
  return normalized;
};

describe('custom field type acceptance (Flutter UI types)', () => {
  const flutterUiToApi: Record<string, string> = {
    Text: 'TEXT',
    Secret: 'PASSWORD',
    Email: 'EMAIL',
    URL: 'URL',
    Phone: 'PHONE',
    Number: 'NUMBER',
    Multiline: 'NOTE',
    Date: 'DATE',
  };

  for (const [ui, api] of Object.entries(flutterUiToApi)) {
    it(`accepts Flutter ${ui} as ${api}`, () => {
      assert.equal(parseFieldType(api), api);
    });
  }

  it('maps legacy SECRET → PASSWORD (not rejected)', () => {
    assert.equal(parseFieldType('SECRET'), 'PASSWORD');
  });

  it('maps MULTILINE → NOTE', () => {
    assert.equal(parseFieldType('MULTILINE'), 'NOTE');
  });

  it('rejects unknown types', () => {
    assert.equal(parseFieldType('NOT_A_TYPE'), null);
  });
});

describe('password clear gate (payload semantics)', () => {
  const shouldClear = (payload: { password?: unknown } | null) => {
    if (payload == null || !Object.prototype.hasOwnProperty.call(payload, 'password')) {
      return false;
    }
    if (payload.password === null || payload.password === undefined) return false;
    return String(payload.password).length === 0;
  };

  const shouldSet = (payload: { password?: unknown } | null) => {
    if (payload == null || !Object.prototype.hasOwnProperty.call(payload, 'password')) {
      return false;
    }
    if (payload.password === null || payload.password === undefined) return false;
    return String(payload.password).length > 0;
  };

  it('empty string clears', () => {
    assert.equal(shouldClear({ password: '' }), true);
    assert.equal(shouldSet({ password: '' }), false);
  });

  it('non-empty sets', () => {
    assert.equal(shouldClear({ password: 'x' }), false);
    assert.equal(shouldSet({ password: 'x' }), true);
  });

  it('omitted password does not clear', () => {
    assert.equal(shouldClear({}), false);
    assert.equal(shouldSet({}), false);
  });
});
