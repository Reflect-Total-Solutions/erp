import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import {
  checkSessionPermission,
  getUserEffectivePermissions,
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
      { error: "Forbidden: Administrator privilege required." },
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
        include: { roles: { include: { role: true } } },
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
      hasCustomPermissions: customPermissions !== null && Object.keys(customPermissions).length > 0,
      customPermissions,
      effectivePermissions: effective,
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

  const isAuthorized = await checkSessionPermission(session, "accessControl", "edit");
  if (!isAuthorized) {
    return NextResponse.json(
      { error: "Forbidden: Administrator privilege required to modify user permissions." },
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
        include: { roles: { include: { role: true } } },
      });
    }

    if (!user) {
      return NextResponse.json(
        { error: "User account not found." },
        { status: 404 }
      );
    }

    // Safety guard: Admin user must retain accessControl view to avoid permanent lockout
    const isAdmin = user.roles.some((r) => r.role.name.toLowerCase() === "admin");
    if (isAdmin && !resetToRoleDefault && permissions?.accessControl?.view === false) {
      return NextResponse.json(
        { error: "Safety Guard: Administrator accounts must retain Access Control view permission." },
        { status: 400 }
      );
    }

    const updatedPermissionsValue = resetToRoleDefault ? null : permissions;

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        permissions: updatedPermissionsValue,
      },
    });

    await logAuditEvent({
      userId: session.userId,
      action: resetToRoleDefault ? "RESET_USER_PERMISSIONS" : "CUSTOMIZE_USER_PERMISSIONS",
      resource: "users",
      resourceId: user.id,
      details: {
        targetUser: updatedUser.name,
        targetEmail: updatedUser.email,
        resetToRoleDefault: !!resetToRoleDefault,
        modulesModified: permissions ? Object.keys(permissions) : [],
      },
      req,
    });

    const effective = await getUserEffectivePermissions(user.id);

    return NextResponse.json({
      success: true,
      message: resetToRoleDefault
        ? `Permissions for "${updatedUser.name}" reset to role defaults in PostgreSQL.`
        : `Custom module permissions for "${updatedUser.name}" saved successfully in PostgreSQL database.`,
      permissions: (updatedUser as any).permissions,
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
