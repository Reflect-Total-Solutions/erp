import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { logAuditEvent } from "@/lib/audit";
import { checkSessionPermission } from "@/lib/permissions";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/users/[id]
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
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User account not found." },
        { status: 404 }
      );
    }

    const rawRole = (user.roles?.[0]?.role?.name || "employee").toLowerCase();
    const roleId =
      rawRole === "admin"
        ? "role-admin"
        : rawRole === "supervisor"
        ? "role-supervisor"
        : "role-employer";

    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone || "",
        jobTitle: user.jobTitle || undefined,
        department: rawRole.toUpperCase(),
        roleId,
        role: rawRole,
        status: user.deletedAt ? "Suspended" : user.isActive ? "Active" : "Suspended",
        isActive: user.isActive,
        isDeleted: user.deletedAt !== null,
        deletedAt: user.deletedAt?.toISOString(),
        lastLogin: user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never",
        createdAt: user.createdAt.toISOString().split("T")[0],
      },
    });
  } catch (err) {
    console.error("GET /api/users/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to retrieve user details." },
      { status: 500 }
    );
  }
}

// PUT /api/users/[id]
// Update user details (name, email, phone, role, password, status)
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
      { error: "Forbidden: Administrator privilege required to edit user accounts." },
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

  const { name, email, phone, role, status, newPassword } = body;

  try {
    const existing = await prisma.user.findUnique({
      where: { id },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "User account not found." },
        { status: 404 }
      );
    }

    // Check duplicate email if changing email
    if (email && email.toLowerCase() !== existing.email.toLowerCase()) {
      const emailConflict = await prisma.user.findFirst({
        where: {
          email: { equals: email, mode: "insensitive" },
          id: { not: id },
          deletedAt: null,
        },
      });
      if (emailConflict) {
        return NextResponse.json(
          { error: `The email "${email}" is already used by another account.` },
          { status: 409 }
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (name) updateData.name = name.trim();
    if (email) updateData.email = email.trim().toLowerCase();
    if (phone !== undefined) updateData.phone = phone.trim();
    if (status !== undefined) {
      updateData.isActive = status === "Active";
    }

    if (newPassword && newPassword.trim().length >= 8) {
      updateData.passwordHash = await hashPassword(newPassword.trim());
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    // Update role if changed
    if (role && ["admin", "supervisor", "employee"].includes(role.toLowerCase())) {
      let dbRole = await prisma.role.findUnique({
        where: { name: role.toLowerCase() },
      });
      if (!dbRole) {
        dbRole = await prisma.role.create({
          data: {
            name: role.toLowerCase(),
            description: `${role.toUpperCase()} role access`,
          },
        });
      }

      await prisma.userRole.deleteMany({
        where: { userId: id },
      });

      await prisma.userRole.create({
        data: {
          userId: id,
          roleId: dbRole.id,
        },
      });
    }

    await logAuditEvent({
      userId: session.userId,
      action: "UPDATE_USER",
      resource: "users",
      resourceId: id,
      details: {
        updatedFields: Object.keys(updateData),
        role,
      },
      req,
    });

    return NextResponse.json({
      success: true,
      message: `User account "${updatedUser.name}" updated successfully.`,
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        isActive: updatedUser.isActive,
      },
    });
  } catch (err) {
    console.error("PUT /api/users/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to update user account in database." },
      { status: 500 }
    );
  }
}

// DELETE /api/users/[id]
// Soft-delete by default, or permanent delete if ?permanent=true
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized access. Please log in." },
      { status: 401 }
    );
  }

  const isAuthorized = await checkSessionPermission(session, "accessControl", "delete");
  if (!isAuthorized) {
    return NextResponse.json(
      { error: "Forbidden: Administrator privilege required to delete user accounts." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const isPermanent = searchParams.get("permanent") === "true";

  try {
    const targetUser = await prisma.user.findUnique({
      where: { id },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!targetUser) {
      return NextResponse.json(
        { error: "User account not found." },
        { status: 404 }
      );
    }

    // Safety rule: Cannot delete yourself
    if (targetUser.id === session.userId) {
      return NextResponse.json(
        { error: "Action prohibited: You cannot delete your own active administrator account." },
        { status: 400 }
      );
    }

    // Safety rule: Cannot delete the last active administrator
    const isAdmin = targetUser.roles.some((r) => r.role.name.toLowerCase() === "admin");
    if (isAdmin) {
      const activeAdminCount = await prisma.userRole.count({
        where: {
          role: { name: "admin" },
          user: {
            deletedAt: null,
            isActive: true,
            id: { not: targetUser.id },
          },
        },
      });

      if (activeAdminCount === 0) {
        return NextResponse.json(
          { error: "Action prohibited: Cannot delete or deactivate the last remaining Administrator account." },
          { status: 400 }
        );
      }
    }

    if (isPermanent) {
      // Hard delete
      await prisma.user.delete({
        where: { id },
      });

      await logAuditEvent({
        userId: session.userId,
        action: "PERMANENT_DELETE_USER",
        resource: "users",
        resourceId: id,
        details: { deletedEmail: targetUser.email, deletedName: targetUser.name },
        req,
      });

      return NextResponse.json({
        success: true,
        message: `User account "${targetUser.name}" has been permanently purged.`,
      });
    } else {
      // Soft delete
      const deactivated = await prisma.user.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          isActive: false,
        },
      });

      await logAuditEvent({
        userId: session.userId,
        action: "DEACTIVATE_USER",
        resource: "users",
        resourceId: id,
        details: { email: deactivated.email, name: deactivated.name },
        req,
      });

      return NextResponse.json({
        success: true,
        message: `User account "${deactivated.name}" has been deactivated.`,
      });
    }
  } catch (err) {
    console.error("DELETE /api/users/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to delete user account." },
      { status: 500 }
    );
  }
}
