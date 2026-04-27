// @ts-nocheck
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.roleCanManageRole = exports.ROLE_HIERARCHY = exports.roleHasAllPermissions = exports.roleHasAnyPermission = exports.roleHasPermission = exports.getPermissionsForRole = exports.ROLE_PERMISSIONS = exports.Permission = exports.UserRole = void 0;
var UserRole;
(function (UserRole) {
    UserRole["OWNER"] = "owner";
    UserRole["ADMIN"] = "admin";
    UserRole["MEMBER"] = "member";
    UserRole["VIEWER"] = "viewer";
})(UserRole || (exports.UserRole = UserRole = {}));
var Permission;
(function (Permission) {
    Permission["VAULT_CREATE"] = "vault:create";
    Permission["VAULT_READ"] = "vault:read";
    Permission["VAULT_UPDATE"] = "vault:update";
    Permission["VAULT_DELETE"] = "vault:delete";
    Permission["ITEM_CREATE"] = "item:create";
    Permission["ITEM_READ"] = "item:read";
    Permission["ITEM_UPDATE"] = "item:update";
    Permission["ITEM_DELETE"] = "item:delete";
    Permission["SHARE_MANAGE"] = "share:manage";
    Permission["SHARE_VIEW"] = "share:view";
    Permission["USERS_INVITE"] = "users:invite";
    Permission["USERS_VIEW"] = "users:view";
    Permission["USERS_UPDATE_ROLE"] = "users:update_role";
    Permission["USERS_SUSPEND"] = "users:suspend";
    Permission["USERS_REVOKE"] = "users:revoke";
    Permission["BILLING_READ"] = "billing:read";
    Permission["BILLING_UPDATE"] = "billing:update";
    Permission["BILLING_CANCEL"] = "billing:cancel";
    Permission["LOGS_READ"] = "logs:read";
    Permission["LOGS_EXPORT"] = "logs:export";
    Permission["SETTINGS_READ"] = "settings:read";
    Permission["SETTINGS_UPDATE"] = "settings:update";
    Permission["SECRETS_CREATE"] = "secrets:create";
    Permission["SECRETS_READ"] = "secrets:read";
    Permission["SECRETS_UPDATE"] = "secrets:update";
    Permission["SECRETS_DELETE"] = "secrets:delete";
})(Permission || (exports.Permission = Permission = {}));
exports.ROLE_PERMISSIONS = {
    [UserRole.OWNER]: [
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
        Permission.SECRETS_CREATE,
        Permission.SECRETS_READ,
        Permission.SECRETS_UPDATE,
        Permission.SECRETS_DELETE,
    ],
    [UserRole.ADMIN]: [
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
        Permission.SECRETS_CREATE,
        Permission.SECRETS_READ,
        Permission.SECRETS_UPDATE,
        Permission.SECRETS_DELETE,
    ],
    [UserRole.MEMBER]: [
        Permission.VAULT_READ,
        Permission.ITEM_CREATE,
        Permission.ITEM_READ,
        Permission.ITEM_UPDATE,
        Permission.ITEM_DELETE,
        Permission.SHARE_VIEW,
        Permission.SECRETS_CREATE,
        Permission.SECRETS_READ,
        Permission.SECRETS_UPDATE,
        Permission.SECRETS_DELETE,
    ],
    [UserRole.VIEWER]: [
        Permission.VAULT_READ,
        Permission.ITEM_READ,
        Permission.SHARE_VIEW,
        Permission.SECRETS_READ,
    ],
};
const getPermissionsForRole = (role) => {
    const normalizedRole = role.toLowerCase();
    return exports.ROLE_PERMISSIONS[normalizedRole] || [];
};
exports.getPermissionsForRole = getPermissionsForRole;
const roleHasPermission = (role, permission) => {
    const permissions = (0, exports.getPermissionsForRole)(role);
    return permissions.includes(permission);
};
exports.roleHasPermission = roleHasPermission;
const roleHasAnyPermission = (role, permissions) => {
    const rolePermissions = (0, exports.getPermissionsForRole)(role);
    return permissions.some(perm => rolePermissions.includes(perm));
};
exports.roleHasAnyPermission = roleHasAnyPermission;
const roleHasAllPermissions = (role, permissions) => {
    const rolePermissions = (0, exports.getPermissionsForRole)(role);
    return permissions.every(perm => rolePermissions.includes(perm));
};
exports.roleHasAllPermissions = roleHasAllPermissions;
exports.ROLE_HIERARCHY = {
    [UserRole.OWNER]: 4,
    [UserRole.ADMIN]: 3,
    [UserRole.MEMBER]: 2,
    [UserRole.VIEWER]: 1,
};
const roleCanManageRole = (role1, role2) => {
    const normalizedRole1 = role1.toLowerCase();
    const normalizedRole2 = role2.toLowerCase();
    const hierarchy1 = exports.ROLE_HIERARCHY[normalizedRole1] || 0;
    const hierarchy2 = exports.ROLE_HIERARCHY[normalizedRole2] || 0;
    return hierarchy1 >= hierarchy2;
};
exports.roleCanManageRole = roleCanManageRole;


export {};

// __CJS_EXPORT_BRIDGE__
const __cjs_exports: any = exports as any;
export const roleCanManageRole = __cjs_exports.roleCanManageRole;
export const ROLE_HIERARCHY = __cjs_exports.ROLE_HIERARCHY;
export const roleHasAllPermissions = __cjs_exports.roleHasAllPermissions;
export const roleHasAnyPermission = __cjs_exports.roleHasAnyPermission;
export const roleHasPermission = __cjs_exports.roleHasPermission;
export const getPermissionsForRole = __cjs_exports.getPermissionsForRole;
export const ROLE_PERMISSIONS = __cjs_exports.ROLE_PERMISSIONS;
export const Permission = __cjs_exports.Permission;
export const UserRole = __cjs_exports.UserRole;
