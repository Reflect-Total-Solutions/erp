import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { canUserAccessRecord } from "@/lib/data-visibility";
import {
  createAttachmentSignedUrl,
  downloadAttachmentFromStorage,
  deleteFromSupabaseStorage,
  SUPPLIER_INVOICES_BUCKET,
} from "@/lib/supabase";
import { logAuditEvent } from "@/lib/audit";

// GET /api/supplier-invoices/attachments/[id]
// Secure access to private Supabase Storage attachments via short-lived signed URLs or streaming
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
    const action = searchParams.get("action") || "preview"; // "signed-url" | "download" | "preview"

    const db = getPrisma();
    const attachment = await (db.supplierInvoiceAttachment as any).findUnique({
      where: { id },
      include: {
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            jobId: true,
            createdById: true,
            deletedAt: true,
          },
        },
      },
    });

    if (!attachment || attachment.invoice?.deletedAt) {
      return NextResponse.json(
        { success: false, error: "Attachment not found or invoice has been deleted." },
        { status: 404 }
      );
    }

    // Enforce data visibility and parent invoice ownership
    const accessCheck = await canUserAccessRecord(
      session,
      "supplierInvoices",
      attachment.invoice?.createdById,
      "download"
    );
    if (!accessCheck.allowed) {
      return NextResponse.json(
        { success: false, error: "Forbidden: You do not have permission to access attachments for this invoice." },
        { status: 403 }
      );
    }

    const storagePath = attachment.storagePath;
    const bucket = attachment.bucketName || SUPPLIER_INVOICES_BUCKET;

    if (!storagePath) {
      // Fallback to direct fileUrl if storagePath not recorded
      if (attachment.fileUrl) {
        if (action === "signed-url") {
          return NextResponse.json({
            success: true,
            signedUrl: attachment.fileUrl,
            fileName: attachment.fileName,
            mimeType: attachment.mimeType || attachment.fileType,
            fileSize: attachment.fileSize,
          });
        }
        return NextResponse.redirect(attachment.fileUrl);
      }
      return NextResponse.json(
        { success: false, error: "Storage path not found for this attachment." },
        { status: 404 }
      );
    }

    // 1. Return fresh short-lived signed URL (3600 seconds = 1 hour)
    if (action === "signed-url") {
      const signedUrl = await createAttachmentSignedUrl(storagePath, 3600, bucket);
      if (!signedUrl) {
        return NextResponse.json(
          { success: false, error: "Failed to generate secure signed URL from Supabase Storage." },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        signedUrl,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType || attachment.fileType || "application/octet-stream",
        fileSize: attachment.fileSize,
        storagePath,
      });
    }

    // 2. Stream file directly or redirect for download
    if (action === "download") {
      const downloadRes = await downloadAttachmentFromStorage(storagePath, bucket);
      if (downloadRes.success && downloadRes.data) {
        const arrayBuffer = await downloadRes.data.arrayBuffer();
        const headers = new Headers();
        headers.set(
          "Content-Disposition",
          `attachment; filename="${encodeURIComponent(attachment.fileName)}"`
        );
        headers.set(
          "Content-Type",
          attachment.mimeType || attachment.fileType || "application/octet-stream"
        );
        headers.set("Content-Length", String(arrayBuffer.byteLength));
        return new NextResponse(arrayBuffer, { status: 200, headers });
      }

      // Fallback: redirect to signed URL
      const signedUrl = await createAttachmentSignedUrl(storagePath, 300, bucket);
      if (signedUrl) {
        return NextResponse.redirect(signedUrl);
      }
    }

    // 3. Default: generate signed URL and redirect
    const signedUrl = await createAttachmentSignedUrl(storagePath, 3600, bucket);
    if (!signedUrl) {
      return NextResponse.json(
        { success: false, error: "Failed to generate secure preview URL." },
        { status: 500 }
      );
    }

    return NextResponse.redirect(signedUrl);
  } catch (err: any) {
    console.error("GET /api/supplier-invoices/attachments/[id] error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error accessing attachment." },
      { status: 500 }
    );
  }
}

// DELETE /api/supplier-invoices/attachments/[id]
// Removes attachment record from PostgreSQL and removes file from Supabase Storage
export async function DELETE(
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
    const reason = searchParams.get("reason")?.trim() || "User removed attachment";

    const db = getPrisma();
    const attachment = await (db.supplierInvoiceAttachment as any).findUnique({
      where: { id },
      include: {
        invoice: true,
      },
    });

    if (!attachment) {
      return NextResponse.json(
        { success: false, error: "Attachment not found." },
        { status: 404 }
      );
    }

    // 1. Delete file from Supabase Storage if storagePath exists
    if (attachment.storagePath) {
      await deleteFromSupabaseStorage(
        attachment.storagePath,
        attachment.bucketName || SUPPLIER_INVOICES_BUCKET
      );
    }

    // 2. Delete database record and write audit log in transaction
    await db.$transaction(async (tx) => {
      await (tx.supplierInvoiceAttachment as any).delete({
        where: { id },
      });

      await (tx.supplierInvoiceAuditLog as any).create({
        data: {
          invoiceId: attachment.invoiceId,
          userId: session.userId,
          action: "REMOVE_ATTACHMENT",
          reason,
          previousData: {
            attachmentId: attachment.id,
            fileName: attachment.fileName,
            storagePath: attachment.storagePath,
            fileSize: attachment.fileSize,
          },
          newData: null,
        },
      });
    });

    await logAuditEvent({
      userId: session.userId,
      action: "DELETE_SUPPLIER_INVOICE_ATTACHMENT",
      resource: "supplier-invoices",
      resourceId: attachment.invoiceId,
      details: {
        attachmentId: id,
        fileName: attachment.fileName,
        storagePath: attachment.storagePath,
        reason,
      },
      req,
    });

    return NextResponse.json({
      success: true,
      message: `Attachment "${attachment.fileName}" removed from storage and database.`,
    });
  } catch (err: any) {
    console.error("DELETE /api/supplier-invoices/attachments/[id] error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error deleting attachment." },
      { status: 500 }
    );
  }
}
