import { UserRole } from '../enums';

/**
 * VyaparNet Permission Registry
 *
 * Format: resource:action
 * Authority: VyaparNet_API_Contracts_Backend_Scaffold_Blueprint.md Section 2
 *
 * Permissions are additive per sprint:
 * Sprint 1: Auth + User + Business permissions (below)
 * Sprint 2+: Catalog permissions added
 * Sprint 4+: Order/Payment permissions added
 */

export enum Permission {
  // ─── User Domain ───────────────────────────────────────────
  USER_VIEW = 'user:view',
  USER_UPDATE = 'user:update',
  USER_MANAGE = 'user:manage',         // Admin only

  // ─── Business Domain ───────────────────────────────────────
  BUSINESS_CREATE = 'business:create',
  BUSINESS_UPDATE = 'business:update',
  BUSINESS_MANAGE = 'business:manage', // Admin only

  // ─── Auth Domain ───────────────────────────────────────────
  AUTH_LOGOUT_ALL = 'auth:logout-all',

  // ─── Admin Domain ──────────────────────────────────────────
  ADMIN_ACCESS = 'admin:access',

  // ─── Product Domain (added Sprint 2) ───────────────────────
  PRODUCT_CREATE = 'product:create',
  PRODUCT_UPDATE = 'product:update',
  PRODUCT_DELETE = 'product:delete',
  PRODUCT_APPROVE = 'product:approve',

  // ─── Inventory Domain (added Sprint 3) ─────────────────────
  INVENTORY_VIEW = 'inventory:view',
  INVENTORY_UPDATE = 'inventory:update',

  // ─── Order Domain (added Sprint 4) ─────────────────────────
  ORDER_CREATE = 'order:create',
  ORDER_VIEW = 'order:view',
  ORDER_CANCEL = 'order:cancel',
  ORDER_MANAGE = 'order:manage',       // Admin only

  // ─── Payment Domain (added Sprint 4) ───────────────────────
  PAYMENT_INITIATE = 'payment:initiate',
  PAYMENT_REFUND = 'payment:refund',
  PAYMENT_MANAGE = 'payment:manage',   // Admin only
}

/**
 * Role → Permissions mapping.
 *
 * This is the authoritative permission map.
 * Guards use this to check if a role has a permission.
 *
 * Authority: VyaparNet_API_Contracts_Backend_Scaffold_Blueprint.md Section 2
 */
export const RolePermissions: Record<UserRole, Permission[]> = {
  [UserRole.BUYER]: [
    Permission.USER_VIEW,
    Permission.USER_UPDATE,
    Permission.BUSINESS_CREATE,
    Permission.ORDER_CREATE,
    Permission.ORDER_VIEW,
    Permission.ORDER_CANCEL,
    Permission.PAYMENT_INITIATE,
  ],

  [UserRole.SELLER]: [
    Permission.USER_VIEW,
    Permission.USER_UPDATE,
    Permission.BUSINESS_CREATE,
    Permission.BUSINESS_UPDATE,
    Permission.PRODUCT_CREATE,
    Permission.PRODUCT_UPDATE,
    Permission.PRODUCT_DELETE,
    Permission.INVENTORY_VIEW,
    Permission.INVENTORY_UPDATE,
    Permission.ORDER_VIEW,
  ],

  [UserRole.SELLER_MANAGER]: [
    // All SELLER permissions
    Permission.USER_VIEW,
    Permission.USER_UPDATE,
    Permission.BUSINESS_CREATE,
    Permission.BUSINESS_UPDATE,
    Permission.PRODUCT_CREATE,
    Permission.PRODUCT_UPDATE,
    Permission.PRODUCT_DELETE,
    Permission.INVENTORY_VIEW,
    Permission.INVENTORY_UPDATE,
    Permission.ORDER_VIEW,
    // Plus manager-specific
    Permission.AUTH_LOGOUT_ALL,
  ],

  [UserRole.ADMIN]: [
    // All permissions
    ...Object.values(Permission),
  ],
};
