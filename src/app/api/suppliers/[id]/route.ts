import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { supplierUpdateSchema } from "@/lib/validations/supplier";
import { logAuditEvent } from "@/lib/audit";
import { checkSessionPermission } from "@/lib/permissions";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/suppliers/[id]
export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized access. Please log in." },
      { status: 401 }
    );
  }

  const isAuthorized = await checkSessionPermission(session, "suppliers", "view");
  if (!isAuthorized) {
    return NextResponse.json(
      { error: "Forbidden: You do not have permission to view this supplier." },
      { status: 403 }
    );
  }

  const { id } = await params;

  try {
    const supplier = await prisma.supplier.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        updatedBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!supplier) {
      return NextResponse.json(
        { error: "Supplier not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: supplier.id,
        code: supplier.code,
        name: supplier.name,
        contactPerson: supplier.contactPerson,
        phone: supplier.phone,
        email: supplier.email,
        address: supplier.address,
        isActive: supplier.isActive,
        isDeleted: supplier.deletedAt !== null,
        deletedAt: supplier.deletedAt ? supplier.deletedAt.toISOString() : undefined,
        createdAt: supplier.createdAt.toISOString().split("T")[0],
        updatedAt: supplier.updatedAt.toISOString(),
        createdById: supplier.createdById || null,
        createdByName: supplier.createdBy?.name || null,
        updatedById: supplier.updatedById || null,
        updatedByName: supplier.updatedBy?.name || null,
      },
    });
  } catch (err) {
    console.error("GET /api/suppliers/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to retrieve supplier." },
      { status: 500 }
    );
  }
}

// PUT /api/suppliers/[id]
// Update supplier details with validation & duplicate check
export async function PUT(req: NextRequest, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized access. Please log in." },
      { status: 401 }
    );
  }

  const isAuthorized = await checkSessionPermission(session, "suppliers", "edit");
  if (!isAuthorized) {
    return NextResponse.json(
      { error: "Forbidden: You do not have permission to edit suppliers." },
      { status: 403 }
    );
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body." },
      { status: 400 }
    );
  }

  // 1. Zod schema validation
  const result = supplierUpdateSchema.safeParse(body);
  if (!result.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const field = issue.path[0] ? String(issue.path[0]) : "general";
      fieldErrors[field] = issue.message;
    }
    return NextResponse.json(
      { error: "Validation failed.", fieldErrors },
      { status: 422 }
    );
  }

  const updates = result.data;

  try {
    // 2. Verify supplier exists
    const existing = await prisma.supplier.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Supplier not found." },
        { status: 404 }
      );
    }

    // 3. If updating code, verify uniqueness among other active suppliers
    if (updates.code && updates.code.toUpperCase() !== existing.code.toUpperCase()) {
      const duplicateCode = await prisma.supplier.findFirst({
        where: {
          id: { not: id },
          code: { equals: updates.code, mode: "insensitive" },
          deletedAt: null,
        },
      });
      if (duplicateCode) {
        return NextResponse.json(
          {
            error: `Code "${updates.code}" is already in use by another active supplier (${duplicateCode.name}).`,
            fieldErrors: { code: `Code "${updates.code}" is already in use.` },
          },
          { status: 409 }
        );
      }
    }

    // 4. If updating email, verify uniqueness among other active suppliers
    if (updates.email && updates.email.toLowerCase() !== existing.email.toLowerCase()) {
      const duplicateEmail = await prisma.supplier.findFirst({
        where: {
          id: { not: id },
          email: { equals: updates.email, mode: "insensitive" },
          deletedAt: null,
        },
      });
      if (duplicateEmail) {
        return NextResponse.json(
          {
            error: `Email "${updates.email}" is already registered to another active supplier (${duplicateEmail.name}).`,
            fieldErrors: { email: `Email "${updates.email}" is already in use.` },
          },
          { status: 409 }
        );
      }
    }

    // 5. Update in database
    const updated = await prisma.supplier.update({
      where: { id },
      data: {
        ...(updates.code && { code: updates.code }),
        ...(updates.name && { name: updates.name }),
        ...(updates.contactPerson && { contactPerson: updates.contactPerson }),
        ...(updates.phone && { phone: updates.phone }),
        ...(updates.email && { email: updates.email }),
        ...(updates.address && { address: updates.address }),
        ...(updates.isActive !== undefined && { isActive: updates.isActive }),
        updatedById: session.userId,
      },
    });

    // 6. Audit log
    await logAuditEvent({
      userId: session.userId,
      action: "UPDATE_SUPPLIER",
      resource: "suppliers",
      resourceId: updated.id,
      details: {
        previous: {
          code: existing.code,
          name: existing.name,
          email: existing.email,
        },
        updated: {
          code: updated.code,
          name: updated.name,
          email: updated.email,
        },
      },
      req,
    });

    return NextResponse.json({
      success: true,
      message: `Supplier "${updated.name}" updated successfully.`,
      data: {
        id: updated.id,
        code: updated.code,
        name: updated.name,
        contactPerson: updated.contactPerson,
        phone: updated.phone,
        email: updated.email,
        address: updated.address,
        isActive: updated.isActive,
        isDeleted: updated.deletedAt !== null,
        deletedAt: updated.deletedAt ? updated.deletedAt.toISOString() : undefined,
        createdAt: updated.createdAt.toISOString().split("T")[0],
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    console.error("PUT /api/suppliers/[id] error:", err);
    return NextResponse.json(
      { error: "Database error occurred while updating supplier." },
      { status: 500 }
    );
  }
}

// DELETE /api/suppliers/[id]
// Supports Soft Delete (default) or Permanent Purge (?permanent=true)
export async function DELETE(req: NextRequest, { params }: RouteParams) {
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
      { error: "Forbidden: You do not have permission to delete suppliers." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const isPermanent = searchParams.get("permanent") === "true";

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

    if (isPermanent) {
      const canPermDelete = await checkSessionPermission(session, "suppliers", "permanentDelete");
      if (!canPermDelete) {
        return NextResponse.json(
          { error: "Forbidden: You do not have permission to permanently delete suppliers." },
          { status: 403 }
        );
      }

      // Protect suppliers linked to Purchase Orders or Supplier Invoices from permanent purge
      const [poCount, invoiceCount] = await Promise.all([
        prisma.purchaseOrder.count({ where: { supplierId: id } }),
        prisma.supplierInvoice.count({ where: { supplierId: id } }),
      ]);

      if (poCount > 0 || invoiceCount > 0) {
        const deps: string[] = [];
        if (poCount > 0) deps.push(`${poCount} Purchase Order(s)`);
        if (invoiceCount > 0) deps.push(`${invoiceCount} Supplier Invoice(s)`);
        return NextResponse.json(
          {
            success: false,
            blocked: true,
            error: `Cannot Permanently Delete Supplier "${existing.name}": Supplier has linked ${deps.join(
              " and "
            )}. Financial and procurement records must be preserved.`,
          },
          { status: 422 }
        );
      }

      // Permanent Purge
      await prisma.supplier.delete({
        where: { id },
      });

      await logAuditEvent({
        userId: session.userId,
        action: "PERMANENT_DELETE_SUPPLIER",
        resource: "suppliers",
        resourceId: id,
        details: { code: existing.code, name: existing.name },
        req,
      });

      return NextResponse.json({
        success: true,
        message: `Supplier "${existing.name}" (${existing.code}) was permanently deleted.`,
        permanent: true,
      });
    }

    // Default: Soft Delete (Set deletedAt timestamp and deactivate)
    const softDeleted = await prisma.supplier.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    await logAuditEvent({
      userId: session.userId,
      action: "SOFT_DELETE_SUPPLIER",
      resource: "suppliers",
      resourceId: id,
      details: {
        code: softDeleted.code,
        name: softDeleted.name,
        deletedAt: softDeleted.deletedAt?.toISOString(),
      },
      req,
    });

    return NextResponse.json({
      success: true,
      message: `Supplier "${softDeleted.name}" (${softDeleted.code}) has been archived to trash.`,
      softDeleted: true,
      data: {
        id: softDeleted.id,
        isDeleted: true,
        deletedAt: softDeleted.deletedAt?.toISOString(),
      },
    });
  } catch (err) {
    console.error("DELETE /api/suppliers/[id] error:", err);
    return NextResponse.json(
      { error: "Database error occurred while deleting supplier." },
      { status: 500 }
    );
  }
}
