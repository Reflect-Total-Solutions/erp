import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { checkSessionPermission } from "@/lib/permissions";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/suppliers/[id]/restore
// Restores a soft-deleted supplier back to active status
export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized access. Please log in." },
      { status: 401 }
    );
  }

  const isAuthorized = await checkSessionPermission(session, "suppliers", "delete");
  if (!isAuthorized) {
    return NextResponse.json(
      { error: "Forbidden: You do not have permission to restore suppliers." },
      { status: 403 }
    );
  }

  const { id } = await params;

  try {
    const existing = await prisma.supplier.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Supplier not found." },
        { status: 404 }
      );
    }

    if (!existing.deletedAt) {
      return NextResponse.json(
        { message: "Supplier is already active.", data: existing },
        { status: 200 }
      );
    }

    // Verify code uniqueness before restoring
    const activeWithSameCode = await prisma.supplier.findFirst({
      where: {
        id: { not: id },
        code: { equals: existing.code, mode: "insensitive" },
        deletedAt: null,
      },
    });

    if (activeWithSameCode) {
      return NextResponse.json(
        {
          error: `Cannot restore: Code "${existing.code}" is currently used by active supplier "${activeWithSameCode.name}". Please edit the code first.`,
        },
        { status: 409 }
      );
    }

    // Restore supplier
    const restored = await prisma.supplier.update({
      where: { id },
      data: {
        deletedAt: null,
        isActive: true,
      },
    });

    // Audit log
    await logAuditEvent({
      userId: session.userId,
      action: "RESTORE_SUPPLIER",
      resource: "suppliers",
      resourceId: id,
      details: { code: restored.code, name: restored.name },
      req,
    });

    return NextResponse.json({
      success: true,
      message: `Supplier "${restored.name}" has been restored to active registry.`,
      data: {
        id: restored.id,
        code: restored.code,
        name: restored.name,
        contactPerson: restored.contactPerson,
        phone: restored.phone,
        email: restored.email,
        address: restored.address,
        isActive: restored.isActive,
        isDeleted: false,
        createdAt: restored.createdAt.toISOString().split("T")[0],
        updatedAt: restored.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    console.error("POST /api/suppliers/[id]/restore error:", err);
    return NextResponse.json(
      { error: "Database error occurred while restoring supplier." },
      { status: 500 }
    );
  }
}
