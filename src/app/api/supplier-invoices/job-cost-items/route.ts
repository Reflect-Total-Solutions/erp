import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkSessionPermission } from "@/lib/permissions";
import {
  canAccessJobForSupplierInvoice,
  getJobCostItemsWithInvoiceStatus,
  isJobEligibleForSupplierInvoice,
} from "@/lib/supplier-invoice-helpers";

// GET /api/supplier-invoices/job-cost-items?jobId=...&excludeInvoiceId=...
// Retrieves all saved Excel cost categories & line items for an Approved Job,
// along with active Supplier Invoice utilization & remaining balance per line item.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { success: false, error: "Unauthorized access. Please log in." },
      { status: 401 }
    );
  }

  const canAccess =
    (await checkSessionPermission(session, "supplierInvoices", "view")) ||
    (await checkSessionPermission(session, "supplierInvoices", "create")) ||
    (await checkSessionPermission(session, "supplierInvoices", "edit"));

  if (!canAccess) {
    return NextResponse.json(
      { success: false, error: "Forbidden: You do not have permission to access supplier invoice cost items." },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId")?.trim() || "";
  const excludeInvoiceId = searchParams.get("excludeInvoiceId")?.trim() || null;

  if (!jobId) {
    return NextResponse.json(
      { success: false, error: "Query parameter jobId is required." },
      { status: 400 }
    );
  }

  try {
    const db = getPrisma();
    const rawJob = await (db.job as any).findUnique({
      where: { id: jobId },
      select: {
        id: true,
        jobCode: true,
        status: true,
        deletedAt: true,
        submittedById: true,
      },
    });

    if (!rawJob || rawJob.deletedAt) {
      return NextResponse.json(
        { success: false, error: "Selected Job was not found." },
        { status: 404 }
      );
    }

    const canAccessJob = await canAccessJobForSupplierInvoice(session, rawJob.submittedById);
    if (!canAccessJob) {
      return NextResponse.json(
        { success: false, error: "Selected Job was not found within your authorized access scope." },
        { status: 404 }
      );
    }

    if (!isJobEligibleForSupplierInvoice(rawJob.status, rawJob.deletedAt)) {
      return NextResponse.json(
        {
          success: false,
          error: `Supplier Invoices can only be created against Approved Jobs. Job "${rawJob.jobCode}" currently has status "${rawJob.status}".`,
        },
        { status: 422 }
      );
    }

    const [result, canOverrideBudget, canManualEntry] = await Promise.all([
      getJobCostItemsWithInvoiceStatus(jobId, excludeInvoiceId, db),
      checkSessionPermission(session, "supplierInvoices", "overrideJobBudget"),
      checkSessionPermission(session, "supplierInvoices", "manualEntry"),
    ]);

    return NextResponse.json({
      success: true,
      data: result ? { ...result, itemsById: undefined } : null,
      permissions: {
        canOverrideBudget,
        canManualEntry,
      },
    });
  } catch (err: any) {
    console.error("GET /api/supplier-invoices/job-cost-items error:", err);
    const rawMsg = String(err?.message || "");
    const friendlyError =
      rawMsg.includes("Unknown argument") || rawMsg.includes("Unknown field")
        ? "The running server's cached Prisma client is outdated after the latest database schema update. Please stop and restart the Next.js server (npm run dev) so it loads the updated database models."
        : rawMsg || "Failed to load Job cost items.";
    return NextResponse.json(
      { success: false, error: friendlyError },
      { status: 500 }
    );
  }
}
