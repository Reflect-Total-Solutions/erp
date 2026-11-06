import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import {
  checkSessionPermission,
  getUserEffectivePermissions,
  PERMISSION_MODULES,
  ERPModule,
  ERPAction,
  PermissionsPolicy,
} from "@/lib/permissions";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/users/[id]/permissions
// Returns custom and effective permissions for a specific user
export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized access. Please log in." },
      { status: 401 }
    );
  }

  const isAuthorized = await checkSessionPermission(session, "accessControl", "view");
  if (!isAuthorized) {
    return NextResponse.json(
      { error: "Forbidden: Administrator privilege required to view permissions." },
      { status: 403 }
    );
  }

  const { id } = await params;

  try {
    let user = await prisma.user.findUnique({
      where: { id },
      include: {
        roles: {
          include: { role: true },
        },
        userPermissions: {
          include: { permission: true },
        },
      },
    });

    if (!user) {
      user = await prisma.user.findFirst({
        where: {
          OR: [
            { email: { equals: id, mode: "insensitive" } },
            { name: { equals: id, mode: "insensitive" } },
          ],
        },
        include: {
          roles: { include: { role: true } },
          userPermissions: { include: { permission: true } },
        },
      });
    }

    if (!user) {
      return NextResponse.json(
        { error: "User account not found." },
        { status: 404 }
      );
    }

    const effective = await getUserEffectivePermissions(user.id);
    const customPermissions = (user as any).permissions as Partial<PermissionsPolicy> | null;

    return NextResponse.json({
      success: true,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      role: user.roles?.[0]?.role?.name || "employee",
      hasCustomPermissions:
        (customPermissions !== null && Object.keys(customPermissions).length > 0) ||
        (user.userPermissions && user.userPermissions.length > 0),
      customPermissions,
      effectivePermissions: effective,
      modules: PERMISSION_MODULES,
    });
  } catch (err) {
    console.error("GET /api/users/[id]/permissions error:", err);
    return NextResponse.json(
      { error: "Failed to retrieve user permissions." },
      { status: 500 }
    );
  }
}

// PUT /api/users/[id]/permissions
// Updates or revokes module permissions for a specific user directly in PostgreSQL
export async function PUT(req: NextRequest, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized access. Please log in." },
      { status: 401 }
    );
  }

  // Enforce granular managePermissions permission
  const isAuthorized =
    (await checkSessionPermission(session, "accessControl", "managePermissions")) ||
    (await checkSessionPermission(session, "accessControl", "edit"));

  if (!isAuthorized) {
    return NextResponse.json(
      { error: "Forbidden: You do not have permission to manage user permissions." },
      { status: 403 }
    );
  }

  const { id } = await params;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body." },
      { status: 400 }
    );
  }

  const { permissions, resetToRoleDefault } = body;

  try {
    let user = await prisma.user.findUnique({
      where: { id },
      include: {
        roles: {
          include: { role: true },
        },
        userPermissions: {
          include: { permission: true },
        },
      },
    });

    if (!user) {
      user = await prisma.user.findFirst({
        where: {
          OR: [
            { email: { equals: id, mode: "insensitive" } },
            { name: { equals: id, mode: "insensitive" } },
          ],
        },
        include: {
          roles: { include: { role: true } },
          userPermissions: { include: { permission: true } },
        },
      });
    }

    if (!user) {
      return NextResponse.json(
        { error: "User account not found." },
        { status: 404 }
      );
    }

    // 1. Anti-Self-Escalation Guard: Users cannot modify their own permissions
    if (session.userId === user.id) {
      return NextResponse.json(
        {
          error:
            "Prohibited Action: You cannot modify your own permissions. Contact another system administrator to change your permissions.",
        },
        { status: 403 }
      );
    }

    // 2. Anti-Lockout Guard for Super Admin
    const isSuperAdminEmail =
      user.email.toLowerCase() ===
      (process.env.ADMIN_EMAIL || "admin@reflecterp.com").toLowerCase();

    if (isSuperAdminEmail && !resetToRoleDefault) {
      if (
        permissions?.accessControl?.view === false ||
        permissions?.accessControl?.managePermissions === false
      ) {
        return NextResponse.json(
          {
            error:
              "Anti-Lockout Protection: Super Administrator must retain Access Control View and Manage Permissions.",
          },
          { status: 400 }
        );
      }
    }

    // 3. Database Updates: user_permissions relational table + audit log
    if (resetToRoleDefault) {
      // Remove all per-user overrides from user_permissions table
      try {
        await prisma.userPermission.deleteMany({
          where: { userId: user.id },
        });

        // Record reset in permission audit log
        await prisma.permissionAuditLog.create({
          data: {
            targetUserId: user.id,
            moduleKey: "all",
            actionKey: "reset",
            previousValue: true,
            newValue: false,
            changedById: session.userId,
            reason: `Permissions reset to role default for ${user.name}`,
          },
        });
      } catch (dbErr) {
        console.warn("Could not modify user_permissions table directly:", dbErr);
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { permissions: Prisma.DbNull },
      });
    } else if (permissions && typeof permissions === "object") {
      // Clean and sanitize permissions policy
      const sanitizedPermissions: PermissionsPolicy = {};

      for (const mod of PERMISSION_MODULES) {
        const inputMod = permissions[mod.key];
        if (inputMod && typeof inputMod === "object") {
          sanitizedPermissions[mod.key] = {};
          const isViewDisabled = inputMod.view === false;

          for (const act of mod.actions) {
            if (typeof inputMod[act.key] === "boolean") {
              // Logical dependency: if view is false, child actions must be false
              if (isViewDisabled && act.key !== "view") {
                sanitizedPermissions[mod.key]![act.key] = false;
              } else {
                sanitizedPermissions[mod.key]![act.key] = inputMod[act.key];
              }
            }
          }
        }
      }

      // Persist to user.permissions JSON cache
      await prisma.user.update({
        where: { id: user.id },
        data: { permissions: sanitizedPermissions as any },
      });

      // Synchronize to relational user_permissions table
      try {
        for (const [modKey, actions] of Object.entries(sanitizedPermissions)) {
          for (const [actKey, isAllowed] of Object.entries(actions || {})) {
            // Find or create Permission record
            let perm = await prisma.permission.findFirst({
              where: {
                resource: modKey,
                action: actKey,
              },
            });

            if (!perm) {
              const modDef = PERMISSION_MODULES.find((m) => m.key === modKey);
              const actDef = modDef?.actions.find((a) => a.key === actKey);
              perm = await prisma.permission.create({
                data: {
                  description: actDef?.description || `${actKey} in ${modKey}`,
                  resource: modKey,
                  action: actKey,
                },
              });
            }

            // Upsert UserPermission
            const existingUserPerm = await prisma.userPermission.findUnique({
              where: {
                userId_permissionId: {
                  userId: user.id,
                  permissionId: perm.id,
                },
              },
            });

            const prevValue = existingUserPerm ? existingUserPerm.isAllowed : null;

            if (existingUserPerm) {
              if (existingUserPerm.isAllowed !== isAllowed) {
                await prisma.userPermission.update({
                  where: { id: existingUserPerm.id },
                  data: {
                    isAllowed,
                    updatedById: session.userId,
                  },
                });

                await prisma.permissionAuditLog.create({
                  data: {
                    targetUserId: user.id,
                    permissionId: perm.id,
                    moduleKey: modKey,
                    actionKey: actKey,
                    previousValue: prevValue,
                    newValue: isAllowed,
                    changedById: session.userId,
                    reason: `Updated ${modKey}.${actKey} to ${isAllowed}`,
                  },
                });
              }
            } else {
              await prisma.userPermission.create({
                data: {
                  userId: user.id,
                  permissionId: perm.id,
                  isAllowed,
                  updatedById: session.userId,
                },
              });

              await prisma.permissionAuditLog.create({
                data: {
                  targetUserId: user.id,
                  permissionId: perm.id,
                  moduleKey: modKey,
                  actionKey: actKey,
                  previousValue: null,
                  newValue: isAllowed,
                  changedById: session.userId,
                  reason: `Created override ${modKey}.${actKey} = ${isAllowed}`,
                },
              });
            }
          }
        }
      } catch (dbRelErr) {
        console.warn("Relational user_permissions update skipped or table pending:", dbRelErr);
      }
    }

    await logAuditEvent({
      userId: session.userId,
      action: resetToRoleDefault ? "RESET_USER_PERMISSIONS" : "CUSTOMIZE_USER_PERMISSIONS",
      resource: "users",
      resourceId: user.id,
      details: {
        targetUser: user.name,
        targetEmail: user.email,
        resetToRoleDefault: !!resetToRoleDefault,
        modulesModified: permissions ? Object.keys(permissions) : [],
      },
      req,
    });

    const effective = await getUserEffectivePermissions(user.id);

    return NextResponse.json({
      success: true,
      message: resetToRoleDefault
        ? `Permissions for "${user.name}" reset to role defaults in PostgreSQL database.`
        : `Custom module permissions for "${user.name}" saved successfully in PostgreSQL database.`,
      effectivePermissions: effective,
    });
  } catch (err) {
    console.error("PUT /api/users/[id]/permissions error:", err);
    return NextResponse.json(
      { error: "Failed to persist user permissions in database." },
      { status: 500 }
    );
  }
}
