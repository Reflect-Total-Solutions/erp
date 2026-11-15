import { prisma } from "@/lib/prisma";
import {
  ERPModule,
  ERPAction,
  getUserEffectivePermissions,
  checkSessionPermission,
} from "@/lib/permissions";

export type VisibilityScope = "own" | "team" | "all";

/**
 * Resolves the record visibility scope for a user in a specific module.
 * Evaluates in order of highest privilege:
 * 1. Super Admin bypass (always "all")
 * 2. Explicit viewAll permission -> "all"
 * 3. Explicit viewTeam permission -> "team"
 * 4. Explicit viewOwn permission -> "own"
 * 5. Fallback based on user primary role (admin: all, supervisor: team, employee: own)
 */
export async function getModuleVisibilityScope(
  session: { userId?: string; roles?: string[]; email?: string } | null | undefined,
  module: ERPModule
): Promise<VisibilityScope> {
  if (!session || !session.userId) {
    return "own";
  }

  // Super Admin bypass
  const isAdmin = session.roles?.some((r) => r.toLowerCase() === "admin");
  if (isAdmin && session.email === (process.env.ADMIN_EMAIL || "admin@reflecterp.com")) {
    return "all";
  }

  try {
    const effectivePolicy = await getUserEffectivePermissions(session.userId);
    const modPolicy = effectivePolicy[module];

    if (modPolicy?.viewAll === true) {
      return "all";
    }
    if (modPolicy?.viewTeam === true) {
      return "team";
    }
    if (modPolicy?.viewOwn === true) {
      return "own";
    }

    // Role-based fallback
    if (isAdmin) return "all";
    if (session.roles?.some((r) => r.toLowerCase() === "supervisor")) return "team";
    return "own";
  } catch (err) {
    console.error(`Error resolving visibility scope for ${module}:`, err);
    if (isAdmin) return "all";
    return "own";
  }
}

/**
 * Retrieves the list of user IDs within the authorized team/scope for a supervisor or user.
 * Returns null if scope is "all" (meaning unrestricted).
 */
export async function getAuthorizedUserIdsForScope(
  userId: string,
  scope: VisibilityScope
): Promise<string[] | null> {
  if (scope === "all") {
    return null; // Unrestricted: all records
  }

  if (scope === "own") {
    return [userId];
  }

  // scope === "team"
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        department: true,
        subordinates: {
          where: { deletedAt: null },
          select: { id: true },
        },
      },
    });

    const authorizedSet = new Set<string>();
    authorizedSet.add(userId);

    if (user?.subordinates && user.subordinates.length > 0) {
      user.subordinates.forEach((sub) => authorizedSet.add(sub.id));
    }

    // Also include colleagues in the same department if department is set
    if (user?.department) {
      const departmentUsers = await prisma.user.findMany({
        where: {
          department: user.department,
          deletedAt: null,
        },
        select: { id: true },
      });
      departmentUsers.forEach((du) => authorizedSet.add(du.id));
    }

    // If supervisor has no explicit subordinates or department assigned yet,
    // default supervisor scope covers all employees so supervisors can manage employee records
    if (authorizedSet.size === 1) {
      const allEmployees = await prisma.user.findMany({
        where: {
          deletedAt: null,
          roles: {
            some: {
              role: {
                name: { in: ["employee", "Employee"] },
              },
            },
          },
        },
        select: { id: true },
      });
      allEmployees.forEach((emp) => authorizedSet.add(emp.id));
    }

    return Array.from(authorizedSet);
  } catch (err) {
    console.error("Error retrieving authorized user IDs for team scope:", err);
    return [userId];
  }
}

/**
 * Builds a Prisma query filter object enforcing record isolation and ownership.
 *
 * @param session - Authenticated user session
 * @param module - Target ERP module
 * @param creatorField - Database column name storing record creator (e.g. "submittedById", "createdById")
 * @param allowSystemRecordsForTeam - Whether supervisors/admins can see historical/system records with null creator
 */
export async function buildRecordVisibilityFilter(
  session: { userId?: string; roles?: string[]; email?: string } | null | undefined,
  module: ERPModule,
  creatorField: string = "submittedById",
  allowSystemRecordsForTeam: boolean = true
): Promise<{
  filter: Record<string, any>;
  scope: VisibilityScope;
  authorizedIds: string[] | null;
}> {
  if (!session || !session.userId) {
    return { filter: { [creatorField]: "__UNAUTHORIZED__" }, scope: "own", authorizedIds: [] };
  }

  const scope = await getModuleVisibilityScope(session, module);

  if (scope === "all") {
    return { filter: {}, scope, authorizedIds: null };
  }

  if (scope === "own") {
    return {
      filter: { [creatorField]: session.userId },
      scope,
      authorizedIds: [session.userId],
    };
  }

  // scope === "team"
  const authorizedIds = await getAuthorizedUserIdsForScope(session.userId, "team");

  if (!authorizedIds || authorizedIds.length === 0) {
    return {
      filter: { [creatorField]: session.userId },
      scope,
      authorizedIds: [session.userId],
    };
  }

  if (allowSystemRecordsForTeam) {
    return {
      filter: {
        OR: [
          { [creatorField]: { in: authorizedIds } },
          { [creatorField]: null }, // Historical / system records
        ],
      },
      scope,
      authorizedIds,
    };
  }

  return {
    filter: { [creatorField]: { in: authorizedIds } },
    scope,
    authorizedIds,
  };
}

/**
 * Checks whether the authenticated user has permission to perform a specific action
 * on a single existing record based on ownership and scope.
 */
export async function canUserAccessRecord(
  session: { userId?: string; roles?: string[]; email?: string } | null | undefined,
  module: ERPModule,
  recordOwnerId: string | null | undefined,
  action: ERPAction = "view"
): Promise<{ allowed: boolean; reason?: string }> {
  if (!session || !session.userId) {
    return { allowed: false, reason: "Unauthorized: Please log in." };
  }

  // 1. Verify module action permission
  const hasActionPerm = await checkSessionPermission(session, module, action);
  if (!hasActionPerm) {
    return {
      allowed: false,
      reason: `Forbidden: You do not have permission to perform "${action}" on ${module}.`,
    };
  }

  // Super Admin fast-path
  const isAdmin = session.roles?.some((r) => r.toLowerCase() === "admin");
  if (isAdmin && session.email === (process.env.ADMIN_EMAIL || "admin@reflecterp.com")) {
    return { allowed: true };
  }

  const scope = await getModuleVisibilityScope(session, module);

  // If user has viewAll scope, they can access all records for view
  if (scope === "all") {
    return { allowed: true };
  }

  // If user is accessing their own record, allowed
  if (recordOwnerId && recordOwnerId === session.userId) {
    return { allowed: true };
  }

  // For EDIT / DELETE / CANCEL / SUBMIT / REVERSE:
  // Employees can ONLY modify records within their own scope
  if (["edit", "delete", "cancel", "restore", "permanentDelete", "submit", "reverse"].includes(action)) {
    if (isAdmin) {
      return { allowed: true };
    }

    if (scope === "team") {
      const authorizedIds = await getAuthorizedUserIdsForScope(session.userId, "team");
      if (recordOwnerId && authorizedIds && authorizedIds.includes(recordOwnerId)) {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: "Forbidden: You cannot modify records created outside your authorized team scope.",
      };
    }

    // Employee / scope=own
    return {
      allowed: false,
      reason: "Forbidden: You can only edit or delete records created by yourself.",
    };
  }

  // For VIEW / DOWNLOAD / EXPORT:
  if (scope === "team") {
    // If historical/system record with no creator, supervisor is allowed
    if (recordOwnerId == null) {
      return { allowed: true };
    }

    const authorizedIds = await getAuthorizedUserIdsForScope(session.userId, "team");
    if (authorizedIds && authorizedIds.includes(recordOwnerId)) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: "Forbidden: You do not have access to records outside your authorized team scope.",
    };
  }

  // scope === "own"
  return {
    allowed: false,
    reason: "Forbidden: You do not have permission to access other employees' records.",
  };
}
