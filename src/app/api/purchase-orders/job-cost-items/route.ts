import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkSessionPermission } from "@/lib/permissions";
import { isJobEligibleForPo } from "@/lib/po-financial";
import { getJobCostItemsWithPoBudget } from "@/lib/po-helpers";

// GET /api/purchase-orders/job-cost-items?jobId=...&excludePoId=...
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized access." }, { status: 401 });
  }

  const canAccess =
    (await checkSessionPermission(session, "purchaseOrders", "view")) ||
    (await checkSessionPermission(session, "purchaseOrders", "create")) ||
    (await checkSessionPermission(session, "purchaseOrders", "edit"));

  if (!canAccess) {
    return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId")?.trim() || "";
  const excludePoId = searchParams.get("excludePoId")?.trim() || null;

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
      select: { id: true, status: true, deletedAt: true, jobCode: true },
    });

    if (!rawJob) {
      return NextResponse.json({ success: false, error: "Job not found." }, { status: 404 });
    }

    if (!isJobEligibleForPo(rawJob.status, rawJob.deletedAt)) {
      return NextResponse.json(
        {
          success: false,
          error: `Purchase Orders can only be linked to active, APPROVED Jobs. Job "${rawJob.jobCode}" has status "${rawJob.status}".`,
        },
        { status: 422 }
      );
    }

    const result = await getJobCostItemsWithPoBudget(jobId, excludePoId, db);
    const canOverrideBudget = await checkSessionPermission(
      session,
      "purchaseOrders",
      "overrideJobBudget"
    );

    return NextResponse.json({
      success: true,
      data: result ? { ...result, itemsById: undefined } : null,
      permissions: {
        canOverrideBudget,
      },
    });
  } catch (err: any) {
    console.error("GET /api/purchase-orders/job-cost-items error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to load Job cost items." },
      { status: 500 }
    );
  }
}
