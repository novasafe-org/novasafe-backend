# RBAC Implementation Guide

## Overview

This document describes the Role-Based Access Control (RBAC) system implemented for NovaSafe. The system follows industry-standard practices with backend enforcement and frontend rendering based on permissions.

## Architecture

### Backend Components

1. **Permission Constants** (`src/constants/rbac.constants.ts`)
   - Defines all roles (OWNER, ADMIN, MEMBER, VIEWER)
   - Defines all permissions (vault:create, item:read, etc.)
   - Maps roles to permissions (single source of truth)

2. **RBAC Service** (`src/services/rbacService.ts`)
   - Resolves user roles from Membership collection or User model
   - Gets user permissions based on role
   - Manages membership records

3. **Authorization Middleware** (`src/middlewares/rbac.ts`)
   - `loadRBACContext`: Loads user role and permissions into request
   - `requireRole(...)`: Requires specific role(s)
   - `requirePermission(...)`: Requires specific permission(s)
   - `requireAllPermissions(...)`: Requires all specified permissions

4. **Membership Model** (`src/models/Membership.ts`)
   - Tracks user-organization-role relationships
   - Supports Team/Business plans with multiple users

### Frontend Components

1. **Permission Utilities** (to be created)
   - `usePermissions()` hook
   - `hasPermission()` helper
   - Permission-based UI rendering

## Usage Examples

### Backend: Protecting Routes

```typescript
import { requirePermission, loadRBACContext } from '../middlewares/rbac';
import { Permission } from '../constants/rbac.constants';

// Require specific permission
router.post('/vaults', 
  authMiddleware,
  loadRBACContext,
  requirePermission(Permission.VAULT_CREATE),
  createVaultController
);

// Require specific role
router.delete('/users/:id',
  authMiddleware,
  loadRBACContext,
  requireRole(UserRole.OWNER, UserRole.ADMIN),
  deleteUserController
);
```

### Backend: Including Permissions in Response

```typescript
import { attachUserPermissions } from '../middlewares/rbac';

export const getAccountDetails = async (req: Request, res: Response) => {
  await loadRBACContext(req, res, () => {});
  const userPermissions = attachUserPermissions(req);
  
  res.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      role: userPermissions.role,
      permissions: userPermissions.permissions, // Include in response
    },
  });
};
```

### Frontend: Using Permissions

```typescript
import { usePermissions } from '@/hooks/usePermissions';

function MyComponent() {
  const { hasPermission } = usePermissions();
  
  return (
    <>
      {hasPermission('vault:create') && (
        <Button onClick={createVault}>Create Vault</Button>
      )}
      {hasPermission('users:invite') && (
        <Button onClick={inviteUser}>Invite User</Button>
      )}
    </>
  );
}
```

## Permission Matrix

| Permission | OWNER | ADMIN | MEMBER | VIEWER |
|------------|-------|-------|--------|--------|
| vault:create | ✅ | ✅ | ❌ | ❌ |
| vault:read | ✅ | ✅ | ✅* | ✅* |
| vault:update | ✅ | ✅ | ❌ | ❌ |
| vault:delete | ✅ | ✅ | ❌ | ❌ |
| item:create | ✅ | ✅ | ✅* | ❌ |
| item:read | ✅ | ✅ | ✅* | ✅* |
| item:update | ✅ | ✅ | ✅* | ❌ |
| item:delete | ✅ | ✅ | ✅* | ❌ |
| share:manage | ✅ | ✅ | ❌ | ❌ |
| users:invite | ✅ | ✅ | ❌ | ❌ |
| users:view | ✅ | ✅ | ❌ | ❌ |
| billing:read | ✅ | ❌ | ❌ | ❌ |
| billing:update | ✅ | ❌ | ❌ | ❌ |
| logs:read | ✅ | ✅ | ❌ | ❌ |

*MEMBER and VIEWER permissions are limited to assigned vaults/items.

## Migration Notes

- Existing routes need to be updated to use permission middleware
- Frontend needs to be updated to use permissions instead of role checks
- Membership records should be created for existing Team/Business users

