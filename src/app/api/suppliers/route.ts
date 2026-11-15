import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { supplierCreateSchema } from "@/lib/validations/supplier";
import { logAuditEvent } from "@/lib/audit";
import { checkSessionPermission } from "@/lib/permissions";
import { computeDerivedPaymentSummary, roundMoney } from "@/lib/supplier-payment-date";
import { getOrCreateSupplierPaymentSettings } from "@/lib/supplier-payment-notifications";

// GET /api/suppliers
// Supports ?status=active|trash|all&search=term&page=1&limit=50
export async function GET(req: NextRequest) {
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
      { error: "Forbidden: You do not have permission to view suppliers." },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "active"; // "active" | "trash" | "all"
  const search = searchParams.get("search")?.trim() ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
  const skip = (page - 1) * limit;

  // Build Prisma where clause with indexes
  const where: Record<string, unknown> = {};

  if (status === "active") {
    where.deletedAt = null;
  } else if (status === "trash") {
    where.deletedAt = { not: null };
  }
  // if "all", do not filter on deletedAt

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { code: { contains: search, mode: "insensitive" } },
      { contactPerson: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { phone: { contains: search, mode: "insensitive" } },
      { address: { contains: search, mode: "insensitive" } },
    ];
  }

  try {
    const db = getPrisma();
    const paymentSettings = await getOrCreateSupplierPaymentSettings(db);
    const [suppliers, total, poCounts, activeInvoices] = await Promise.all([
      db.supplier.findMany({
        where,
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          updatedBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      db.supplier.count({ where }),
      db.purchaseOrder.groupBy({
        by: ["supplierId"],
        where: { deletedAt: null },
        _count: { id: true },
      }),
      db.supplierInvoice.findMany({
        where: { deletedAt: null, status: { not: "CANCELLED" } },
        select: {
          id: true,
          supplierId: true,
          invoiceDate: true,
          paymentDueDate: true,
          totalAmount: true,
          paidAmount: true,
          status: true,
          payments: {
            where: { status: "SUCCESS" },
            select: { amount: true, status: true, paymentDate: true },
          },
        },
      }),
    ]);

    const poCountMap = new Map<string, number>();
    poCounts.forEach((g) => poCountMap.set(g.supplierId, g._count.id));

    const supplierFinanceMap = new Map<
      string,
      {
        invoiceCount: number;
        totalBilled: number;
        totalPaid: number;
        outstandingBalance: number;
        overdueInvoiceCount: number;
        overdueBalance: number;
      }
    >();

    for (const inv of activeInvoices) {
      const derived = computeDerivedPaymentSummary({
        totalAmount: inv.totalAmount,
        paidAmount: inv.paidAmount,
        dueDate: inv.paymentDueDate,
        invoiceDate: inv.invoiceDate,
        invoiceStatus: inv.status,
        payments: inv.payments,
        timezone: paymentSettings.timezone,
      });

      const current = supplierFinanceMap.get(inv.supplierId) || {
        invoiceCount: 0,
        totalBilled: 0,
        totalPaid: 0,
        outstandingBalance: 0,
        overdueInvoiceCount: 0,
        overdueBalance: 0,
      };
      current.invoiceCount += 1;
      current.totalBilled = roundMoney(current.totalBilled + derived.totalAmount);
      current.totalPaid = roundMoney(current.totalPaid + derived.paidAmount);
      current.outstandingBalance = roundMoney(
        current.outstandingBalance + derived.outstandingBalance
      );
      if (derived.isOverdue) {
        current.overdueInvoiceCount += 1;
        current.overdueBalance = roundMoney(
          current.overdueBalance + derived.outstandingBalance
        );
      }
      supplierFinanceMap.set(inv.supplierId, current);
    }

    return NextResponse.json({
      success: true,
      data: suppliers.map((s) => {
        const fin = supplierFinanceMap.get(s.id) || {
          invoiceCount: 0,
          totalBilled: 0,
          totalPaid: 0,
          outstandingBalance: 0,
          overdueInvoiceCount: 0,
          overdueBalance: 0,
        };
        return {
          id: s.id,
          code: s.code,
          name: s.name,
          contactPerson: s.contactPerson,
          phone: s.phone,
          email: s.email,
          address: s.address,
          isActive: s.isActive,
          purchaseOrderCount: poCountMap.get(s.id) || 0,
          invoiceCount: fin.invoiceCount,
          totalBilled: fin.totalBilled,
          totalPaid: fin.totalPaid,
          outstandingBalance: fin.outstandingBalance,
          overdueInvoiceCount: fin.overdueInvoiceCount,
          overdueBalance: fin.overdueBalance,
          isDeleted: s.deletedAt !== null,
          deletedAt: s.deletedAt ? s.deletedAt.toISOString() : undefined,
          createdAt: s.createdAt.toISOString().split("T")[0],
          updatedAt: s.updatedAt.toISOString(),
        };
      }),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err) {
    console.error("GET /api/suppliers error:", err);
    return NextResponse.json(
      { error: "Failed to retrieve suppliers from database." },
      { status: 500 }
    );
  }
}

// POST /api/suppliers
// Create a new supplier with deep Zod validation and audit logging
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized access. Please log in." },
      { status: 401 }
    );
  }

  const isAuthorized = await checkSessionPermission(session, "suppliers", "create");
  if (!isAuthorized) {
    return NextResponse.json(
      { error: "Forbidden: You do not have permission to register suppliers." },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body." },
      { status: 400 }
    );
  }

  // 1. Deep Zod schema validation
  const result = supplierCreateSchema.safeParse(body);
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

  const { code, name, contactPerson, phone, email, address, isActive } = result.data;

  try {
    const db = getPrisma();
    // 2. Uniqueness check for active supplier code
    const existingCode = await db.supplier.findFirst({
      where: {
        code: { equals: code, mode: "insensitive" },
        deletedAt: null,
      },
    });
    if (existingCode) {
      return NextResponse.json(
        {
          error: `Supplier code "${code}" is already assigned to an active supplier (${existingCode.name}).`,
          fieldErrors: { code: `Code "${code}" is already in use.` },
        },
        { status: 409 }
      );
    }

    // 3. Uniqueness check for active supplier email
    const existingEmail = await db.supplier.findFirst({
      where: {
        email: { equals: email, mode: "insensitive" },
        deletedAt: null,
      },
    });
    if (existingEmail) {
      return NextResponse.json(
        {
          error: `Supplier email "${email}" is already registered to ${existingEmail.name}.`,
          fieldErrors: { email: `Email "${email}" is already in use.` },
        },
        { status: 409 }
      );
    }

    // 4. Create Supplier in PostgreSQL database
    const newSupplier = await db.supplier.create({
      data: {
        code,
        name,
        contactPerson,
        phone,
        email,
        address,
        isActive: isActive ?? true,
        createdById: session.userId,
      },
    });

    // 5. Audit log
    await logAuditEvent({
      userId: session.userId,
      action: "CREATE_SUPPLIER",
      resource: "suppliers",
      resourceId: newSupplier.id,
      details: {
        code: newSupplier.code,
        name: newSupplier.name,
        contactPerson: newSupplier.contactPerson,
        email: newSupplier.email,
      },
      req,
    });

    return NextResponse.json(
      {
        success: true,
        message: `Supplier "${newSupplier.name}" (${newSupplier.code}) created successfully.`,
        data: {
          id: newSupplier.id,
          code: newSupplier.code,
          name: newSupplier.name,
          contactPerson: newSupplier.contactPerson,
          phone: newSupplier.phone,
          email: newSupplier.email,
          address: newSupplier.address,
          isActive: newSupplier.isActive,
          isDeleted: false,
          createdAt: newSupplier.createdAt.toISOString().split("T")[0],
          updatedAt: newSupplier.updatedAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("POST /api/suppliers error:", err);
    return NextResponse.json(
      { error: "Database error occurred while creating supplier." },
      { status: 500 }
    );
  }
}
