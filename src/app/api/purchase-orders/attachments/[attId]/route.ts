import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkSessionPermission } from "@/lib/permissions";
import { canUserAccessRecord } from "@/lib/data-visibility";
import {
  createAttachmentSignedUrl,
  downloadAttachmentFromStorage,
  deleteFromSupabaseStorage,
  PURCHASE_ORDERS_BUCKET,
} from "@/lib/supabase";
import { logAuditEvent } from "@/lib/audit";

// GET /api/purchase-orders/attachments/[attId]
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ attId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized access. Please log in." },
        { status: 401 }
      );
    }

    const { attId } = await params;
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action") || "preview";

    const db = getPrisma();
    const attachment = await (db.purchaseOrderAttachment as any).findUnique({
      where: { id: attId },
      include: {
        purchaseOrder: {
          select: {
            id: true,
            poNumber: true,
            createdById: true,
            deletedAt: true,
          },
        },
      },
    });

    if (!attachment || attachment.deletedAt || attachment.purchaseOrder?.deletedAt) {
      return NextResponse.json(
        { success: false, error: "Attachment not found or Purchase Order has been deleted." },
        { status: 404 }
      );
    }

    const accessCheck = await canUserAccessRecord(
      session,
      "purchaseOrders",
      attachment.purchaseOrder?.createdById,
      "download"
    );
    if (!accessCheck.allowed) {
      return NextResponse.json(
        { success: false, error: "Forbidden: You do not have permission to download PO attachments." },
        { status: 403 }
      );
    }

    const storagePath = attachment.storagePath;
    const bucket = attachment.bucketName || PURCHASE_ORDERS_BUCKET;

    if (!storagePath) {
      if (attachment.fileUrl && !attachment.fileUrl.startsWith("/api/")) {
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

      const fallbackUrl = await createAttachmentSignedUrl(storagePath, 300, bucket);
      if (fallbackUrl) return NextResponse.redirect(fallbackUrl);
    }

    const previewUrl = await createAttachmentSignedUrl(storagePath, 3600, bucket);
    if (!previewUrl) {
      return NextResponse.json(
        { success: false, error: "Failed to generate preview URL." },
        { status: 500 }
      );
    }
    return NextResponse.redirect(previewUrl);
  } catch (err: any) {
    console.error("GET /api/purchase-orders/attachments/[attId] error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to access PO attachment." },
      { status: 500 }
    );
  }
}

// DELETE /api/purchase-orders/attachments/[attId]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ attId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized access." }, { status: 401 });
    }

    const canEdit = await checkSessionPermission(session, "purchaseOrders", "edit");
    if (!canEdit) {
      return NextResponse.json(
        { success: false, error: "Forbidden: You do not have permission to delete PO attachments." },
        { status: 403 }
      );
    }

    const { attId } = await params;
    const { searchParams } = new URL(req.url);
    const reason = searchParams.get("reason")?.trim() || "User removed PO attachment";

    const db = getPrisma();
    const attachment = await (db.purchaseOrderAttachment as any).findUnique({
      where: { id: attId },
      include: { purchaseOrder: true },
    });

    if (!attachment || attachment.deletedAt) {
      return NextResponse.json({ success: false, error: "Attachment not found." }, { status: 404 });
    }

    const scopeCheck = await canUserAccessRecord(
      session,
      "purchaseOrders",
      attachment.purchaseOrder?.createdById,
      "edit"
    );
    if (!scopeCheck.allowed) {
      return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
    }

    const isAdmin = session.roles?.some((r) => r.toLowerCase() === "admin");
    if (
      !isAdmin &&
      ["APPROVED", "ISSUED", "PARTIALLY_DELIVERED", "DELIVERED"].includes(
        attachment.purchaseOrder?.status || ""
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Attachments on Approved/Issued/Delivered POs can only be removed by Administrators.",
        },
        { status: 422 }
      );
    }

    if (attachment.storagePath) {
      await deleteFromSupabaseStorage(
        attachment.storagePath,
        attachment.bucketName || PURCHASE_ORDERS_BUCKET
      );
    }

    await db.$transaction(async (tx) => {
      await (tx.purchaseOrderAttachment as any).delete({ where: { id: attId } });
      await (tx.purchaseOrderAuditLog as any).create({
        data: {
          purchaseOrderId: attachment.purchaseOrderId,
          userId: session.userId,
          action: "REMOVE_ATTACHMENT",
          reason,
          previousData: {
            attachmentId: attachment.id,
            fileName: attachment.fileName,
            category: attachment.category,
          },
          newData: null,
        },
      });
    });

    await logAuditEvent({
      userId: session.userId,
      action: "DELETE_PO_ATTACHMENT",
      resource: "purchaseOrders",
      resourceId: attachment.purchaseOrderId,
      details: { attId, fileName: attachment.fileName, reason },
      req,
    });

    return NextResponse.json({
      success: true,
      message: `Attachment "${attachment.fileName}" deleted.`,
    });
  } catch (err: any) {
    console.error("DELETE /api/purchase-orders/attachments/[attId] error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to delete PO attachment." },
      { status: 500 }
    );
  }
}
