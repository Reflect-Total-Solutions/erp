import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkSessionPermission } from "@/lib/permissions";
import { canUserAccessRecord } from "@/lib/data-visibility";
import {
  JOB_ADDITIONAL_EXPENSES_BUCKET,
  createAttachmentSignedUrl,
  downloadAttachmentFromStorage,
} from "@/lib/supabase";

// GET /api/jobs/[id]/additional-expenses/[expenseId]/receipt
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; expenseId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized access. Please log in." },
        { status: 401 }
      );
    }

    const [
      canViewJobs,
      canViewSummary,
      canCreate,
      canEdit,
    ] = await Promise.all([
      checkSessionPermission(session, "jobs", "view"),
      checkSessionPermission(session, "jobs", "viewFinancialSummary"),
      checkSessionPermission(session, "jobs", "createAdditionalExpense"),
      checkSessionPermission(session, "jobs", "editAdditionalExpense"),
    ]);

    if (!canViewJobs || (!canViewSummary && !canCreate && !canEdit)) {
      return NextResponse.json(
        {
          success: false,
          error: "Forbidden: You do not have permission to view additional expense receipts.",
        },
        { status: 403 }
      );
    }

    const { id, expenseId } = await params;
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action") || "preview";

    const db = getPrisma();
    const expModel = (db as any).jobAdditionalExpense;
    if (!expModel) {
      return NextResponse.json(
        { success: false, error: "Additional expenses model unavailable until dev server restarts." },
        { status: 503 }
      );
    }

    const exp = await expModel.findUnique({
      where: { id: expenseId },
      include: {
        job: { select: { submittedById: true, deletedAt: true } },
      },
    });

    if (!exp || exp.jobId !== id || exp.job?.deletedAt) {
      return NextResponse.json(
        { success: false, error: "Additional expense record not found." },
        { status: 404 }
      );
    }

    const vis = await canUserAccessRecord(
      session,
      "jobs",
      exp.job?.submittedById,
      "view"
    );
    if (!vis.allowed) {
      return NextResponse.json(
        { success: false, error: vis.reason || "Forbidden." },
        { status: 403 }
      );
    }

    if (!exp.attachmentStoragePath) {
      return NextResponse.json(
        { success: false, error: "No receipt uploaded for this additional expense." },
        { status: 404 }
      );
    }

    const bucket = exp.attachmentBucket || JOB_ADDITIONAL_EXPENSES_BUCKET;

    if (action === "signed-url") {
      const signedUrl = await createAttachmentSignedUrl(
        exp.attachmentStoragePath,
        3600,
        bucket
      );
      if (!signedUrl) {
        return NextResponse.json(
          { success: false, error: "Failed to generate signed URL." },
          { status: 500 }
        );
      }
      return NextResponse.json({
        success: true,
        signedUrl,
        fileName: exp.attachmentName || "receipt",
        mimeType: exp.attachmentMimeType || "application/octet-stream",
        fileSize: exp.attachmentSize || "—",
      });
    }

    if (action === "download") {
      const downloadRes = await downloadAttachmentFromStorage(
        exp.attachmentStoragePath,
        bucket
      );
      if (downloadRes.success && downloadRes.data) {
        const arrayBuffer = await downloadRes.data.arrayBuffer();
        const headers = new Headers();
        headers.set(
          "Content-Disposition",
          `attachment; filename="${encodeURIComponent(exp.attachmentName || "expense-receipt")}"`
        );
        headers.set(
          "Content-Type",
          exp.attachmentMimeType || "application/octet-stream"
        );
        headers.set("Content-Length", String(arrayBuffer.byteLength));
        return new NextResponse(arrayBuffer, { status: 200, headers });
      }
    }

    const signedUrl = await createAttachmentSignedUrl(
      exp.attachmentStoragePath,
      3600,
      bucket
    );
    if (!signedUrl) {
      return NextResponse.json(
        { success: false, error: "Failed to generate receipt preview URL." },
        { status: 500 }
      );
    }

    return NextResponse.redirect(signedUrl);
  } catch (err: any) {
    console.error("GET /api/jobs/[id]/additional-expenses/[expenseId]/receipt error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to retrieve expense receipt." },
      { status: 500 }
    );
  }
}
