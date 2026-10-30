import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/permissions";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/users/[id]/restore
// Restores a soft-deleted user account
export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized access. Please log in." },
      { status: 401 }
    );
  }

  if (!hasPermission(session.roles, "accessControl", "edit")) {
    return NextResponse.json(
      { error: "Forbidden: Administrator privilege required to restore user accounts." },
      { status: 403 }
    );
  }

  const { id } = await params;

  try {
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User account not found." },
        { status: 404 }
      );
    }

    if (!user.deletedAt) {
      return NextResponse.json(
        { error: "This user account is already active." },
        { status: 400 }
      );
    }

    const restored = await prisma.user.update({
      where: { id },
      data: {
        deletedAt: null,
        isActive: true,
      },
    });

    await logAuditEvent({
      userId: session.userId,
      action: "RESTORE_USER",
      resource: "users",
      resourceId: id,
      details: { email: restored.email, name: restored.name },
      req,
    });

    return NextResponse.json({
      success: true,
      message: `User account "${restored.name}" has been restored to active status.`,
      user: {
        id: restored.id,
        name: restored.name,
        email: restored.email,
        isActive: restored.isActive,
      },
    });
  } catch (err) {
    console.error("POST /api/users/[id]/restore error:", err);
    return NextResponse.json(
      { error: "Failed to restore user account." },
      { status: 500 }
    );
  }
}
