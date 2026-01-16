# Vault Item Encryption Migration

## ✅ Backend Changes Completed

### 1. Validation Middleware Created
**File**: `src/middlewares/vaultItemValidation.ts`

- **`validateVaultItem`**: Validates new items are in encrypted format
  - Requires `encrypted_data` (Base64 encoded AES-256-GCM ciphertext)
  - Requires `iv` (Base64 encoded 12-byte initialization vector)
  - Requires `category`, `field_count`, `attachment_count`
  - **Rejects plain-text items** with helpful error messages

- **`validateVaultItemUpdate`**: Validates item updates maintain encrypted format
  - Ensures encrypted_data and iv are valid if updated
  - Rejects plain-text field updates

### 2. Controller Updates
**File**: `src/controllers/Vault.ts`

- **`addItem`**: 
  - Now expects and stores items in encrypted format
  - Validates required encrypted fields
  - Stores according to `IVaultItem` interface

- **`updateItem`**: 
  - Only allows updates to encrypted format fields
  - Rejects plain-text field updates

- **`getItem` & `getItems`**: 
  - **Backward compatible**: Still returns legacy plain-text items if they exist
  - Logs warnings when legacy items are accessed
  - Returns `_legacyFormat: true` flag for legacy items

### 3. Route Updates
**File**: `src/routes/vaultRoute.ts`

- Added validation middleware to `/addItem` route
- Added validation middleware to `/:id/updateItem` route

---

## ⚠️ Current Status

### Backend: ✅ Ready
- Backend now **rejects** plain-text items
- Backend **requires** encrypted format for new items
- Backend **supports** reading legacy items (backward compatibility)

### Frontend: ❌ Needs Update
- Frontend is still sending plain-text items
- Frontend needs to implement client-side encryption before sending

---

## 🔧 Frontend Changes Required

### 1. Create Encryption Service
**File**: `vault-ui/src/services/encryptionService.ts`

Implement client-side encryption using Web Crypto API:

```typescript
/**
 * Encrypt vault item data using AES-256-GCM
 * @param data - Plain text data to encrypt (JSON stringified)
 * @param key - CryptoKey for encryption
 * @returns { encrypted_data: string, iv: string }
 */
export async function encryptVaultItem(
  data: string,
  key: CryptoKey
): Promise<{ encrypted_data: string; iv: string }> {
  // Generate 12-byte IV for GCM
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // Encrypt data
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    key,
    new TextEncoder().encode(data)
  );
  
  // Return base64 encoded ciphertext and IV
  return {
    encrypted_data: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    iv: btoa(String.fromCharCode(...iv))
  };
}

/**
 * Decrypt vault item data
 * @param encrypted_data - Base64 encoded ciphertext
 * @param iv - Base64 encoded IV
 * @param key - CryptoKey for decryption
 * @returns Decrypted plain text data
 */
export async function decryptVaultItem(
  encrypted_data: string,
  iv: string,
  key: CryptoKey
): Promise<string> {
  // Decode base64
  const ciphertext = Uint8Array.from(atob(encrypted_data), c => c.charCodeAt(0));
  const ivBuffer = Uint8Array.from(atob(iv), c => c.charCodeAt(0));
  
  // Decrypt
  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: ivBuffer,
    },
    key,
    ciphertext
  );
  
  return new TextDecoder().decode(decrypted);
}
```

### 2. Create Key Management Service
**File**: `vault-ui/src/services/keyManager.ts`

Implement key derivation and management:

```typescript
/**
 * Derive encryption key from master password
 * Uses Argon2id (or PBKDF2 as fallback)
 */
export async function deriveEncryptionKey(
  password: string,
  salt: Uint8Array,
  userId: string
): Promise<CryptoKey> {
  // Implementation depends on your key derivation strategy
  // See SECURITY_IMPLIMENTATION_PLAN.md for details
}
```

### 3. Update AddItemModal
**File**: `vault-ui/src/components/AddItemModal.tsx`

Modify `handleSave` to encrypt before sending:

```typescript
const handleSave = async () => {
  if (!title || !category) return;

  // Get encryption key (from keyManager)
  const encryptionKey = await getEncryptionKey();
  
  // Prepare item data
  const itemData = {
    fields: fields.map(f => ({
      id: f.id,
      label: f.label,
      type: f.type,
      value: f.value
    })),
    // ... other sensitive data
  };
  
  // Encrypt the item data
  const { encrypted_data, iv } = await encryptVaultItem(
    JSON.stringify(itemData),
    encryptionKey
  );
  
  // Prepare item in encrypted format
  const newItem: VaultItem = {
    id: crypto.randomUUID(),
    title, // Can be plain for search, or encrypted
    category,
    encrypted_data, // ✅ Encrypted
    iv, // ✅ IV
    field_count: fields.length,
    attachment_count: 0,
    folderId: targetFolderId || null,
    isFavorite: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  try {
    await dispatch(addVaultItem(newItem)).unwrap();
    // ... rest of success handling
  } catch (error) {
    // ... error handling
  }
};
```

### 4. Update VaultItemModal
**File**: `vault-ui/src/components/VaultItemModal.tsx`

Modify to decrypt when displaying:

```typescript
useEffect(() => {
  if (item && item.encrypted_data && item.iv) {
    // Decrypt item data
    const decryptAndDisplay = async () => {
      const encryptionKey = await getEncryptionKey();
      const decryptedData = await decryptVaultItem(
        item.encrypted_data!,
        item.iv!,
        encryptionKey
      );
      const itemData = JSON.parse(decryptedData);
      // Set decrypted fields for display
      setFields(itemData.fields || []);
    };
    
    decryptAndDisplay();
  } else if (item && item._legacyFormat) {
    // Handle legacy plain-text items
    setFields(item.fields || []);
  }
}, [item]);
```

### 5. Update API Types
**File**: `vault-ui/src/types/vault.ts`

Update `VaultItem` interface:

```typescript
export interface VaultItem {
  id: string;
  title: string;
  category?: VaultCategory;
  
  // Encrypted format (new)
  encrypted_data?: string; // Base64 encoded ciphertext
  iv?: string; // Base64 encoded IV
  field_count?: number;
  attachment_count?: number;
  
  // Legacy format (for backward compatibility)
  fields?: VaultField[];
  _legacyFormat?: boolean;
  
  // ... rest of fields
}
```

---

## 🚨 Error Handling

When frontend tries to send plain-text items, backend will return:

```json
{
  "message": "Invalid item format",
  "error": "Items must be encrypted client-side before storage. Please use the encryption service to encrypt sensitive data.",
  "details": {
    "required": ["encrypted_data", "iv", "category", "field_count", "attachment_count"],
    "received": ["title", "category", "fields"],
    "issue": "Plain-text data detected. All sensitive data must be encrypted using AES-256-GCM before sending to the backend."
  }
}
```

---

## 📋 Migration Checklist

### Backend ✅
- [x] Validation middleware created
- [x] Controller updated to handle encrypted format
- [x] Backward compatibility for reading legacy items
- [x] Routes updated with validation

### Frontend ⏳
- [ ] Create encryption service
- [ ] Create key management service
- [ ] Update AddItemModal to encrypt before sending
- [ ] Update VaultItemModal to decrypt when displaying
- [ ] Update types to include encrypted fields
- [ ] Test encryption/decryption flow
- [ ] Handle legacy items in UI

---

## 🔐 Security Notes

1. **Never send plain-text sensitive data** to backend
2. **Encryption key must be derived client-side** (never sent to server)
3. **IV must be unique** for each encryption operation
4. **Use AES-256-GCM** for authenticated encryption
5. **Store encryption key securely** (memory-only, cleared on lock/logout)

---

## 📚 References

- **Security Plan**: `SECURITY_IMPLIMENTATION_PLAN.md`
- **Database Schema**: `DATABASE_SCHEMA_SETUP.md`
- **Model Interface**: `src/models/VaultItem.ts`
- **API Documentation**: `API_DOCUMENTATION.md`

---

**Status**: Backend is ready. Frontend encryption implementation required.

