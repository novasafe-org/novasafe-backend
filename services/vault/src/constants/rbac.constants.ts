/**
 * RBAC Constants
 * 
 * Single source of truth for roles, permissions, and role-to-permission mappings.
 * This file defines the complete permission matrix for the NovaSafe application.
 * 
 * IMPORTANT: All permission checks MUST reference these constants.
 * Never hardcode permission strings elsewhere.
 */

/**
 * Supported roles in the system
 */
export enum UserRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
  VIEWER = 'viewer',
}

/**
 * Permission strings
 * Format: resource:action
 * 
 * Resources:
 * - vault: Vault management
 * - item: Vault item management
 * - share: Sharing and access control
 * - users: User management
 * - billing: Billing and subscription
 * - logs: Activity logs
 * - settings: Organization settings
 */
export enum Permission {
  // Vault permissions
  VAULT_CREATE = 'vault:create',
  VAULT_READ = 'vault:read',
  VAULT_UPDATE = 'vault:update',
  VAULT_DELETE = 'vault:delete',
  
  // Item permissions
  ITEM_CREATE = 'item:create',
  ITEM_READ = 'item:read',
  ITEM_UPDATE = 'item:update',
  ITEM_DELETE = 'item:delete',
  
  // Sharing permissions
  SHARE_MANAGE = 'share:manage',
  SHARE_VIEW = 'share:view',
  
  // User management permissions
  USERS_INVITE = 'users:invite',
  USERS_VIEW = 'users:view',
  USERS_UPDATE_ROLE = 'users:update_role',
  USERS_SUSPEND = 'users:suspend',
  USERS_REVOKE = 'users:revoke',
  
  // Billing permissions
  BILLING_READ = 'billing:read',
  BILLING_UPDATE = 'billing:update',
  BILLING_CANCEL = 'billing:cancel',
  
  // Activity logs permissions
  LOGS_READ = 'logs:read',
  LOGS_EXPORT = 'logs:export',
  
  // Organization settings permissions
  SETTINGS_READ = 'settings:read',
  SETTINGS_UPDATE = 'settings:update',
}

/**
 * Role-to-Permission Mapping
 * 
 * This is the single source of truth for what each role can do.
 * All authorization checks should reference this mapping.
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.OWNER]: [
    // Full access to everything
    Permission.VAULT_CREATE,
    Permission.VAULT_READ,
    Permission.VAULT_UPDATE,
    Permission.VAULT_DELETE,
    Permission.ITEM_CREATE,
    Permission.ITEM_READ,
    Permission.ITEM_UPDATE,
    Permission.ITEM_DELETE,
    Permission.SHARE_MANAGE,
    Permission.SHARE_VIEW,
    Permission.USERS_INVITE,
    Permission.USERS_VIEW,
    Permission.USERS_UPDATE_ROLE,
    Permission.USERS_SUSPEND,
    Permission.USERS_REVOKE,
    Permission.BILLING_READ,
    Permission.BILLING_UPDATE,
    Permission.BILLING_CANCEL,
    Permission.LOGS_READ,
    Permission.LOGS_EXPORT,
    Permission.SETTINGS_READ,
    Permission.SETTINGS_UPDATE,
  ],
  
  [UserRole.ADMIN]: [
    // Full access to everything (same as owner)
    // Admins have all permissions except account deletion/ownership transfer
    Permission.VAULT_CREATE,
    Permission.VAULT_READ,
    Permission.VAULT_UPDATE,
    Permission.VAULT_DELETE,
    Permission.ITEM_CREATE,
    Permission.ITEM_READ,
    Permission.ITEM_UPDATE,
    Permission.ITEM_DELETE,
    Permission.SHARE_MANAGE,
    Permission.SHARE_VIEW,
    Permission.USERS_INVITE,
    Permission.USERS_VIEW,
    Permission.USERS_UPDATE_ROLE,
    Permission.USERS_SUSPEND,
    Permission.USERS_REVOKE,
    Permission.BILLING_READ,
    Permission.BILLING_UPDATE,
    Permission.BILLING_CANCEL,
    Permission.LOGS_READ,
    Permission.LOGS_EXPORT,
    Permission.SETTINGS_READ,
    Permission.SETTINGS_UPDATE,
  ],
  
  [UserRole.MEMBER]: [
    // Can access assigned vaults/items and create/edit items
    // Cannot manage users or billing
    Permission.VAULT_READ,
    Permission.ITEM_CREATE,
    Permission.ITEM_READ,
    Permission.ITEM_UPDATE,
    Permission.ITEM_DELETE,
    Permission.SHARE_VIEW,
    // Note: Limited vault/item permissions based on assigned access
  ],
  
  [UserRole.VIEWER]: [
    // Read-only access to assigned vaults/items
    Permission.VAULT_READ,
    Permission.ITEM_READ,
    Permission.SHARE_VIEW,
    // Note: No create/update/delete permissions
  ],
};

/**
 * Get all permissions for a role
 */
export const getPermissionsForRole = (role: UserRole | string): Permission[] => {
  const normalizedRole = role.toLowerCase() as UserRole;
  return ROLE_PERMISSIONS[normalizedRole] || [];
};

/**
 * Check if a role has a specific permission
 */
export const roleHasPermission = (role: UserRole | string, permission: Permission): boolean => {
  const permissions = getPermissionsForRole(role);
  return permissions.includes(permission);
};

/**
 * Check if a role has any of the specified permissions
 */
export const roleHasAnyPermission = (role: UserRole | string, permissions: Permission[]): boolean => {
  const rolePermissions = getPermissionsForRole(role);
  return permissions.some(perm => rolePermissions.includes(perm));
};

/**
 * Check if a role has all of the specified permissions
 */
export const roleHasAllPermissions = (role: UserRole | string, permissions: Permission[]): boolean => {
  const rolePermissions = getPermissionsForRole(role);
  return permissions.every(perm => rolePermissions.includes(perm));
};

/**
 * Role hierarchy (for comparison)
 * Higher number = more privileges
 */
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  [UserRole.OWNER]: 4,
  [UserRole.ADMIN]: 3,
  [UserRole.MEMBER]: 2,
  [UserRole.VIEWER]: 1,
};

/**
 * Check if role1 has higher or equal privileges than role2
 */
export const roleCanManageRole = (role1: UserRole | string, role2: UserRole | string): boolean => {
  const normalizedRole1 = role1.toLowerCase() as UserRole;
  const normalizedRole2 = role2.toLowerCase() as UserRole;
  
  const hierarchy1 = ROLE_HIERARCHY[normalizedRole1] || 0;
  const hierarchy2 = ROLE_HIERARCHY[normalizedRole2] || 0;
  
  return hierarchy1 >= hierarchy2;
};

