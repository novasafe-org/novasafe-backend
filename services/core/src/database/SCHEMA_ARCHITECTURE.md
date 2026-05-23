# Core Service — Schema Architecture

Derived from `mobile_vault` MongoDB usage (read-only analysis). Collection names are **unchanged** for migration compatibility.

## Collection map

| Domain | Mongoose model | MongoDB collection | Status in mobile_vault |
|--------|----------------|-------------------|------------------------|
| Users | `VaultUser` | `vaultUsers` | Active |
| Vault items | `VaultItem` | `vaultItems` | Active |
| Password history | `PasswordHistory` | `mobilePasswordVersions` | Active |
| Custom fields | `CustomField` | `mobileCustomFields` | Active |
| Sessions | `Session` | `sessions` | Active |
| OTP | `OtpCode` | `mobileOtpCodes` | Active |
| 2FA challenges | `TwoFactorChallenge` | `mobileTwoFactorChallenges` | Active |
| Shares | `ShareRecord` | `mobileShareRecords` | Active |
| Export history | `ExportHistory` | `mobileExportHistory` | Active |
| Subscriptions | `UserSubscription` | `mobileSubscriptions` | Active |
| Webhook events | `SubscriptionEvent` | `mobileSubscriptionEvents` | Active |
| Purchases | `PurchaseHistory` | `mobilePurchaseHistory` | Active |
| Entitlements cache | `EntitlementRecord` | `mobileEntitlements` | Reserved |
| Folders | `VaultFolder` | `folders` | Future |
| Secure notes | `SecureNote` | `notes` | Future |
| Documents | `Document` | `documents` | Future |
| Notifications | `Notification` | `notifications` | Future |
| Audit logs | `AuditLog` | `audit_logs` | Future |

## Relationships (logical)

```
VaultUser
  ├── Session (userId)
  ├── VaultItem (userId)
  │     ├── PasswordHistory (credentialId)
  │     └── CustomField (credentialId)
  ├── ShareRecord (senderId / receiverId)
  ├── ExportHistory (userId)
  ├── UserSubscription (userId)
  ├── SubscriptionEvent (userId)
  └── PurchaseHistory (userId)
```

## Shared patterns (`schemas/common/`)

- **encryption** — `encrypted_data`, `iv`, `authTag`, algorithm metadata
- **soft delete** — `deleted`, `deletedAt`, legacy `deleted_at`
- **audit** — `createdBy`, `updatedBy`, timestamps via base schema
- **source / sync** — `source`, `sync_status`, `cloud_version`, etc.
- **device info** — embedded on sessions

## Usage (no business logic yet)

```typescript
import { ModelRegistry, COLLECTIONS, ensureAllSchemaIndexes } from './database';

ModelRegistry.registerAll();
const User = ModelRegistry.get<IVaultUser>('VaultUser');
// Indexes run automatically on ConnectionManager.initialize()
```

## Next steps (later phases)

- `UserRepository`, `VaultRepository`, `SessionRepository` extending `BaseRepository`
- DTO + validators per module aligned with schema field names
- Optional data backfill scripts (do not rename collections)
