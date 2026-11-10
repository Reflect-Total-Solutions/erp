import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkSessionPermission } from "@/lib/permissions";
import { canUserAccessRecord } from "@/lib/data-visibility";
import { logAuditEvent } from "@/lib/audit";
import { validateAttachmentBuffer, MAX_ATTACHMENT_SIZE_BYTES } from "@/lib/file-validation";
import {
  PURCHASE_ORDERS_BUCKET,
  uploadPurchaseOrderAttachment,
  cleanupOrphanedStorageFiles,
} from "@/lib/supabase";

// POST /api/purchase-orders/[id]/attachments
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const uploadedPaths: string[] = [];

  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized access." }, { status: 401 });
    }

    const { id } = await params;
    const formData = await req.formData();
    const category = String(formData.get("category") || "PO_DOCUMENT").trim() || "PO_DOCUMENT";

    const hasEditPerm = await checkSessionPermission(session, "purchaseOrders", "edit");

    if (!hasEditPerm) {
      return NextResponse.json(
        { success: false, error: "Forbidden: You do not have permission to upload PO attachments." },
        { status: 403 }
      );
    }

    const db = getPrisma();
    const po = await (db.purchaseOrder as any).findFirst({
      where: { id, deletedAt: null },
      include: {
        job: { select: { jobCode: true } },
      },
    });

    if (!po) {
      return NextResponse.json({ success: false, error: "Purchase Order not found." }, { status: 404 });
    }

    const scopeCheck = await canUserAccessRecord(
      session,
      "purchaseOrders",
      po.createdById,
      "edit"
    );
    if (!scopeCheck.allowed) {
      return NextResponse.json(
        { success: false, error: scopeCheck.reason || "Forbidden." },
        { status: 403 }
      );
    }

    const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) {
      const single = formData.get("file");
      if (single instanceof File && single.size > 0) files.push(single);
    }

    if (files.length === 0) {
      return NextResponse.json({ success: false, error: "No valid files selected." }, { status: 400 });
    }

    const uploadedMeta: any[] = [];
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const v = validateAttachmentBuffer(buffer, file.name, MAX_ATTACHMENT_SIZE_BYTES);
      if (!v.isValid) {
        if (uploadedPaths.length > 0) {
          await cleanupOrphanedStorageFiles(uploadedPaths, PURCHASE_ORDERS_BUCKET);
        }
        return NextResponse.json(
          { success: false, error: `Attachment Error (${file.name}): ${v.error}` },
          { status: 400 }
        );
      }

      const up = await uploadPurchaseOrderAttachment({
        buffer,
        originalName: v.sanitizedName,
        jobCode: po.job?.jobCode || "JOB",
        poNumber: po.poNumber,
        category,
        contentType: v.mimeType,
        bucket: PURCHASE_ORDERS_BUCKET,
      });

      if (!up.success) {
        if (uploadedPaths.length > 0) {
          await cleanupOrphanedStorageFiles(uploadedPaths, PURCHASE_ORDERS_BUCKET);
        }
        return NextResponse.json(
          { success: false, error: `Failed to upload "${v.sanitizedName}": ${up.error}` },
          { status: 500 }
        );
      }

      uploadedPaths.push(up.storagePath);
      uploadedMeta.push(up);
    }

    const createdRows = await db.$transaction(async (tx) => {
      const rows: any[] = [];
      for (const att of uploadedMeta) {
        const created = await (tx.purchaseOrderAttachment as any).create({
          data: {
            purchaseOrderId: id,
            category,
            fileName: att.fileName,
            originalFileName: att.originalFileName,
            storedFileName: att.storedFileName,
            bucketName: att.bucketName,
            storagePath: att.storagePath,
            fileSize: att.fileSize,
            fileType: att.mimeType,
            mimeType: att.mimeType,
            fileUrl: att.fileUrl,
            uploadedById: session.userId,
          },
        });
        const updated = await (tx.purchaseOrderAttachment as any).update({
          where: { id: created.id },
          data: { fileUrl: `/api/purchase-orders/attachments/${created.id}` },
        });
        rows.push(updated);
      }

      await (tx.purchaseOrderAuditLog as any).create({
        data: {
          purchaseOrderId: id,
          userId: session.userId,
          action: "UPLOAD_ATTACHMENT",
          reason: `Uploaded ${rows.length} attachment(s) (${category})`,
          newData: { files: rows.map((r) => r.fileName) },
        },
      });

      return rows;
    });

    await logAuditEvent({
      userId: session.userId,
      action: "UPLOAD_PO_ATTACHMENT",
      resource: "purchaseOrders",
      resourceId: id,
      details: { poNumber: po.poNumber, category, count: createdRows.length },
      req,
    });

    return NextResponse.json(
      {
        success: true,
        message: `${createdRows.length} supporting file(s) uploaded to ${po.poNumber}.`,
        data: createdRows,
      },
      { status: 201 }
    );
  } catch (err: any) {
    if (uploadedPaths.length > 0) {
      await cleanupOrphanedStorageFiles(uploadedPaths, PURCHASE_ORDERS_BUCKET);
    }
    console.error("POST /api/purchase-orders/[id]/attachments error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to upload PO attachments." },
      { status: 500 }
    );
  }
}
