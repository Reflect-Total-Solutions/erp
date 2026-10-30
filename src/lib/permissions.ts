import { prisma } from "@/lib/prisma";

export type ERPModule =
  | "dashboard"
  | "jobs"
  | "suppliers"
  | "invoices"
  | "approvals"
  | "auditController"
  | "accessControl"
  | "excelUploads";

export type Action = "view" | "create" | "edit" | "delete" | "approve";

export interface ModuleActions {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  approve: boolean;
}

export type PermissionsPolicy = Record<ERPModule, ModuleActions>;

export const DEFAULT_ROLE_PERMISSIONS: Record<string, PermissionsPolicy> = {
  admin: {
    dashboard: { view: true, create: true, edit: true, delete: true, approve: true },
    jobs: { view: true, create: true, edit: true, delete: true, approve: true },
    suppliers: { view: true, create: true, edit: true, delete: true, approve: true },
    invoices: { view: true, create: true, edit: true, delete: true, approve: true },
    approvals: { view: true, create: true, edit: true, delete: true, approve: true },
    auditController: { view: true, create: true, edit: true, delete: true, approve: true },
    accessControl: { view: true, create: true, edit: true, delete: true, approve: true },
    excelUploads: { view: true, create: true, edit: true, delete: true, approve: true },
  },
  supervisor: {
    dashboard: { view: true, create: false, edit: false, delete: false, approve: true },
    jobs: { view: true, create: true, edit: true, delete: false, approve: true },
    suppliers: { view: true, create: true, edit: true, delete: false, approve: false },
    invoices: { view: true, create: true, edit: true, delete: false, approve: true },
    approvals: { view: true, create: false, edit: false, delete: false, approve: true },
    auditController: { view: false, create: false, edit: false, delete: false, approve: false },
    accessControl: { view: false, create: false, edit: false, delete: false, approve: false },
    excelUploads: { view: true, create: true, edit: true, delete: false, approve: true },
  },
  employee: {
    dashboard: { view: true, create: false, edit: false, delete: false, approve: false },
    jobs: { view: true, create: false, edit: false, delete: false, approve: false },
    suppliers: { view: false, create: false, edit: false, delete: false, approve: false },
    invoices: { view: true, create: true, edit: false, delete: false, approve: false },
    approvals: { view: false, create: false, edit: false, delete: false, approve: false },
    auditController: { view: false, create: false, edit: false, delete: false, approve: false },
    accessControl: { view: false, create: false, edit: false, delete: false, approve: false },
    excelUploads: { view: true, create: true, edit: false, delete: false, approve: false },
  },
};

export const ROLE_PERMISSIONS = DEFAULT_ROLE_PERMISSIONS;

/**
 * Synchronously checks permissions against the default policy (fast fallback).
 */
export function hasPermission(
  roles: string[] | string | undefined | null,
  module: ERPModule,
  action: Action
): boolean {
  if (!roles) return false;
  const roleList = Array.isArray(roles) ? roles : [roles];

  return roleList.some((r) => {
    const roleKey = r.toLowerCase().trim();
    return DEFAULT_ROLE_PERMISSIONS[roleKey]?.[module]?.[action] ?? false;
  });
}

/**
 * Retrieves the effective module permissions for a user from PostgreSQL.
 * Checks per-user custom overrides first, then database role policies, then default policies.
 */
export async function getUserEffectivePermissions(
  userId: string
): Promise<PermissionsPolicy> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!user) {
      return DEFAULT_ROLE_PERMISSIONS.employee;
    }

    const primaryRole = (user.roles?.[0]?.role?.name || "employee").toLowerCase();
    const basePolicy =
      DEFAULT_ROLE_PERMISSIONS[primaryRole] || DEFAULT_ROLE_PERMISSIONS.employee;

    // 1. Check if user's role has custom database permissions
    const roleRecord = user.roles?.[0]?.role;
    let rolePolicy = basePolicy;
    if (roleRecord && (roleRecord as any).permissionsData) {
      try {
        const parsed = (roleRecord as any).permissionsData as PermissionsPolicy;
        rolePolicy = { ...basePolicy, ...parsed };
      } catch {
        // fallback
      }
    }

    // 2. Check if user has direct custom permissions assigned
    if ((user as any).permissions) {
      try {
        const userCustom = (user as any).permissions as Partial<PermissionsPolicy>;
        return {
          ...rolePolicy,
          ...userCustom,
        };
      } catch {
        // fallback
      }
    }

    return rolePolicy;
  } catch (err) {
    console.error("getUserEffectivePermissions DB error:", err);
    return DEFAULT_ROLE_PERMISSIONS.admin;
  }
}

/**
 * Backend authorization check: verifies if the requesting session has live permission
 * in PostgreSQL for the specified module and action.
 */
export async function checkSessionPermission(
  session: { userId?: string; roles?: string[] } | null | undefined,
  module: ERPModule,
  action: Action
): Promise<boolean> {
  if (!session || !session.userId) return false;

  try {
    const permissions = await getUserEffectivePermissions(session.userId);
    return permissions[module]?.[action] ?? false;
  } catch {
    return hasPermission(session.roles, module, action);
  }
}
