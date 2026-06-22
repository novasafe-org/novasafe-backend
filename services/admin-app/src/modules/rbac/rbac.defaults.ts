import type { AdminRoleKey, PermissionAction, PermissionKey } from './rbac.types';

export const PERMISSION_DEFINITIONS: Array<{
  key: PermissionKey;
  module: string;
  label: string;
  description: string;
}> = [
  { key: 'rbac.manage', module: 'rbac', label: 'RBAC', description: 'Manage roles and permissions' },
  { key: 'users.manage', module: 'users', label: 'Users', description: 'Full user management' },
  { key: 'users.read', module: 'users', label: 'Users (read)', description: 'View users' },
  { key: 'billing.manage', module: 'billing', label: 'Billing', description: 'Manage billing' },
  { key: 'billing.read', module: 'billing', label: 'Billing (read)', description: 'View billing' },
  { key: 'content.manage', module: 'content', label: 'Content', description: 'Manage blog and media' },
  { key: 'content.read', module: 'content', label: 'Content (read)', description: 'View blog content' },
  { key: 'changelog.manage', module: 'changelog', label: 'Changelog', description: 'Manage release notes' },
  { key: 'changelog.read', module: 'changelog', label: 'Changelog (read)', description: 'View changelog' },
  { key: 'docs.manage', module: 'docs', label: 'Documentation', description: 'Manage docs' },
  { key: 'announcements.manage', module: 'announcements', label: 'Announcements', description: 'Manage announcements' },
  { key: 'support.manage', module: 'support', label: 'Support', description: 'Manage support tickets' },
  { key: 'analytics.read', module: 'analytics', label: 'Analytics', description: 'View analytics' },
  { key: 'security.manage', module: 'security', label: 'Security', description: 'Manage security settings' },
  { key: 'security.read', module: 'security', label: 'Security (read)', description: 'View security' },
  { key: 'system.manage', module: 'system', label: 'System', description: 'Manage status and incidents' },
  { key: 'system.read', module: 'system', label: 'System (read)', description: 'View system status' },
  { key: 'audit.read', module: 'audit', label: 'Audit logs', description: 'View audit logs' },
  { key: 'settings.manage', module: 'settings', label: 'Settings', description: 'Manage workspace settings' },
  { key: 'settings.read', module: 'settings', label: 'Settings (read)', description: 'View settings' },
  { key: 'integrations.manage', module: 'integrations', label: 'Integrations', description: 'Manage integrations' },
];

const manage = 'manage' as PermissionAction;
const read = 'read' as PermissionAction;
const none = 'none' as PermissionAction;

/** Default matrix — owner can override in DB later */
export const DEFAULT_ROLE_PERMISSIONS: Record<AdminRoleKey, Partial<Record<PermissionKey, PermissionAction>>> = {
  owner: Object.fromEntries(PERMISSION_DEFINITIONS.map((p) => [p.key, manage])) as Record<
    PermissionKey,
    PermissionAction
  >,
  admin: {
    'rbac.manage': none,
    'users.manage': none,
    'users.read': read,
    'billing.manage': none,
    'billing.read': read,
    'content.manage': manage,
    'content.read': read,
    'changelog.manage': manage,
    'changelog.read': read,
    'docs.manage': manage,
    'announcements.manage': manage,
    'support.manage': manage,
    'analytics.read': read,
    'security.manage': none,
    'security.read': read,
    'system.manage': manage,
    'system.read': read,
    'audit.read': read,
    'settings.manage': none,
    'settings.read': read,
    'integrations.manage': none,
  },
  member: {
    'rbac.manage': none,
    'users.manage': none,
    'users.read': read,
    'billing.manage': none,
    'billing.read': read,
    'content.manage': read,
    'content.read': read,
    'changelog.manage': read,
    'changelog.read': read,
    'docs.manage': read,
    'announcements.manage': read,
    'support.manage': read,
    'analytics.read': read,
    'security.manage': none,
    'security.read': read,
    'system.manage': none,
    'system.read': read,
    'audit.read': none,
    'settings.manage': none,
    'settings.read': read,
    'integrations.manage': none,
  },
};

export const SYSTEM_ROLES: Array<{ key: AdminRoleKey; name: string; description: string }> = [
  { key: 'owner', name: 'Owner', description: 'Full unrestricted access including RBAC and billing.' },
  { key: 'admin', name: 'Admin', description: 'Manage content, changelog, status, and support.' },
  { key: 'member', name: 'Member', description: 'Read-only access to most modules.' },
];
