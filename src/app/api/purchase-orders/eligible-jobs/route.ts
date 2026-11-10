import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkSessionPermission } from "@/lib/permissions";
import { PO_ACTIVE_COMMITMENT_STATUSES, PO_ELIGIBLE_JOB_STATUSES } from "@/lib/po-financial";

// GET /api/purchase-orders/eligible-jobs
// Returns strictly APPROVED & ACTIVE (non-trashed) Jobs eligible for Purchase Order creation
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized access." }, { status: 401 });
  }

  const canAccess =
    (await checkSessionPermission(session, "purchaseOrders", "create")) ||
    (await checkSessionPermission(session, "purchaseOrders", "view"));

  if (!canAccess) {
    return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
  }

  try {
    const db = getPrisma();
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() || "";

    const where: any = {
      deletedAt: null,
      status: { in: PO_ELIGIBLE_JOB_STATUSES },
    };

    if (search) {
      where.OR = [
        { jobCode: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
        { clientName: { contains: search, mode: "insensitive" } },
      ];
    }

    const jobs = await (db.job as any).findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        jobCode: true,
        name: true,
        date: true,
        commencingDate: true,
        clientName: true,
        status: true,
        totalCost: true,
        grandTotal: true,
        purchaseOrders: {
          where: {
            deletedAt: null,
            status: { in: PO_ACTIVE_COMMITMENT_STATUSES },
          },
          select: {
            id: true,
            grandTotal: true,
            status: true,
          },
        },
        _count: {
          select: { costItems: true },
        },
      },
    });

    const data = jobs.map((job: any) => {
      const approvedJobValue = Number(job.grandTotal || job.totalCost || 0);
      const committedPoValue = (job.purchaseOrders || []).reduce(
        (sum: number, po: any) => sum + Number(po.grandTotal || 0),
        0
      );
      return {
        id: job.id,
        jobCode: job.jobCode,
        name: job.name,
        date: job.date,
        commencingDate: job.commencingDate || job.date,
        clientName: job.clientName || "—",
        status: job.status,
        approvedJobValue,
        committedPoValue,
        activePoCount: job.purchaseOrders?.length || 0,
        costItemsCount: job._count?.costItems || 0,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error("GET /api/purchase-orders/eligible-jobs error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to load eligible approved jobs." },
      { status: 500 }
    );
  }
}
