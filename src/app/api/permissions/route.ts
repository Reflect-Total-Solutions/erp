import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import {
  checkSessionPermission,
  DEFAULT_ROLE_PERMISSIONS,
  ERPModule,
  PermissionsPolicy,
} from "@/lib/permissions";

// GET /api/permissions
// Returns all role permission configurations directly from PostgreSQL database
export async function GET(_req: NextRequest) {
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
      { error: "Forbidden: Administrator privilege required." },
      { status: 403 }
    );
  }

  try {
    const dbRoles = await prisma.role.findMany({
      orderBy: { name: "asc" },
    });

    const rolesData = dbRoles.map((r) => {
      const roleName = r.name.toLowerCase();
      const baseDefault =
        DEFAULT_ROLE_PERMISSIONS[roleName] || DEFAULT_ROLE_PERMISSIONS.employee;
      const customData = (r as any).permissionsData as Partial<PermissionsPolicy> | null;

      let mappedId = r.id;
      if (roleName === "admin") mappedId = "role-admin";
      else if (roleName === "supervisor") mappedId = "role-supervisor";
      else if (roleName === "employee") mappedId = "role-employer";

      return {
        id: mappedId,
        dbId: r.id,
        name: roleName === "admin" ? "Administrator" : roleName === "supervisor" ? "Supervisor" : "Employee",
        rawName: r.name,
        description: r.description || `${r.name.toUpperCase()} role policy`,
        permissions: customData ? { ...baseDefault, ...customData } : baseDefault,
      };
    });

    return NextResponse.json({
      success: true,
      roles: rolesData,
    });
  } catch (err) {
    console.error("GET /api/permissions error:", err);
    return NextResponse.json(
      { error: "Failed to retrieve permissions from database." },
      { status: 500 }
    );
  }
}

// PUT /api/permissions
// Updates a Role's permissions in PostgreSQL and logs an audit trail event
export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized access. Please log in." },
      { status: 401 }
    );
  }

  const isAuthorized = await checkSessionPermission(session, "accessControl", "edit");
  if (!isAuthorized) {
    return NextResponse.json(
      { error: "Forbidden: Administrator privilege required to modify access policies." },
      { status: 403 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body." },
      { status: 400 }
    );
  }

  const { roleId, roleName, permissions } = body;
  if (!roleId && !roleName) {
    return NextResponse.json(
      { error: "roleId or roleName is required." },
      { status: 400 }
    );
  }

  try {
    let targetRole = null;
    if (roleId) {
      targetRole = await prisma.role.findUnique({ where: { id: roleId } });
      if (!targetRole) {
        // Fallback: match by normalized name if roleId is role-admin, role-supervisor, role-employer
        const mappedName = roleId
          .replace("role-", "")
          .replace("employer", "employee")
          .toLowerCase();
        targetRole = await prisma.role.findFirst({
          where: { name: { equals: mappedName, mode: "insensitive" } },
        });
      }
    }
    if (!targetRole && roleName) {
      targetRole = await prisma.role.findFirst({
        where: { name: { equals: String(roleName).toLowerCase(), mode: "insensitive" } },
      });
    }

    if (!targetRole) {
      return NextResponse.json(
        { error: "Role not found in database." },
        { status: 404 }
      );
    }

    // Safety guard: Admin role must always retain accessControl view to avoid permanent lockout
    if (targetRole.name.toLowerCase() === "admin") {
      if (permissions?.accessControl?.view === false) {
        return NextResponse.json(
          { error: "Safety Guard: Administrator role must retain Access Control view permission." },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.role.update({
      where: { id: targetRole.id },
      data: {
        permissionsData: permissions,
      },
    });

    await logAuditEvent({
      userId: session.userId,
      action: "UPDATE_ROLE_PERMISSIONS",
      resource: "accessControl",
      resourceId: targetRole.id,
      details: {
        role: targetRole.name,
        updatedModules: Object.keys(permissions || {}),
      },
      req,
    });

    return NextResponse.json({
      success: true,
      message: `Access policy for "${targetRole.name}" updated successfully in PostgreSQL database.`,
      role: {
        id: updated.id,
        name: updated.name,
        permissions: (updated as any).permissionsData,
      },
    });
  } catch (err) {
    console.error("PUT /api/permissions error:", err);
    return NextResponse.json(
      { error: "Failed to persist role permissions in database." },
      { status: 500 }
    );
  }
}
