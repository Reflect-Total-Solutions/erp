import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { canUserAccessRecord } from "@/lib/data-visibility";
import {
  SUPPLIER_PAYMENTS_BUCKET,
  createAttachmentSignedUrl,
  downloadAttachmentFromStorage,
} from "@/lib/supabase";

// GET /api/supplier-payments/[id]/receipt
// Securely streams or signs private payment receipt proof stored in Supabase
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized access. Please log in." },
        { status: 401 }
      );
    }

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action") || "preview";

    const db = getPrisma();
    if (!(db as any)?.supplierPayment) {
      return NextResponse.json(
        {
          success: false,
          code: "PRISMA_CLIENT_STALE",
          error:
            "Server Prisma Client cache is out of sync with prisma/schema.prisma. Please stop `npm run dev`, run `npx prisma generate`, and restart `npm run dev`.",
        },
        { status: 503 }
      );
    }
    const payment = await db.supplierPayment.findUnique({
      where: { id },
      include: {
        supplierInvoice: { select: { createdById: true, deletedAt: true } },
      },
    });

    if (!payment || payment.supplierInvoice?.deletedAt) {
      return NextResponse.json(
        { success: false, error: "Payment or invoice not found." },
        { status: 404 }
      );
    }

    const ownerId = payment.createdById ?? payment.supplierInvoice?.createdById;
    const accessCheck = await canUserAccessRecord(
      session,
      "supplierPayments",
      ownerId,
      "downloadReceipt"
    );
    if (!accessCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "Forbidden: You do not have permission to download this payment receipt.",
        },
        { status: 403 }
      );
    }

    if (!payment.attachmentStoragePath) {
      return NextResponse.json(
        { success: false, error: "No receipt attachment is uploaded for this payment." },
        { status: 404 }
      );
    }

    const bucket = payment.attachmentBucket || SUPPLIER_PAYMENTS_BUCKET;

    if (action === "signed-url") {
      const signedUrl = await createAttachmentSignedUrl(
        payment.attachmentStoragePath,
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
        fileName: payment.attachmentName || "receipt",
        mimeType: payment.attachmentMimeType || "application/octet-stream",
        fileSize: payment.attachmentSize || "—",
      });
    }

    if (action === "download") {
      const downloadRes = await downloadAttachmentFromStorage(
        payment.attachmentStoragePath,
        bucket
      );
      if (downloadRes.success && downloadRes.data) {
        const arrayBuffer = await downloadRes.data.arrayBuffer();
        const headers = new Headers();
        headers.set(
          "Content-Disposition",
          `attachment; filename="${encodeURIComponent(payment.attachmentName || "payment-receipt")}"`
        );
        headers.set(
          "Content-Type",
          payment.attachmentMimeType || "application/octet-stream"
        );
        headers.set("Content-Length", String(arrayBuffer.byteLength));
        return new NextResponse(arrayBuffer, { status: 200, headers });
      }
    }

    const signedUrl = await createAttachmentSignedUrl(
      payment.attachmentStoragePath,
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
    console.error("GET /api/supplier-payments/[id]/receipt error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to retrieve payment receipt." },
      { status: 500 }
    );
  }
}
