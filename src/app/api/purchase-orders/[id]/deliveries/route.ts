import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkSessionPermission } from "@/lib/permissions";
import { canUserAccessRecord } from "@/lib/data-visibility";
import { logAuditEvent } from "@/lib/audit";
import { roundFinancial, toDecimal } from "@/lib/financial";
import { poDeliverySchema } from "@/lib/validations/purchase-order";
import { validateAttachmentBuffer, MAX_ATTACHMENT_SIZE_BYTES } from "@/lib/file-validation";
import {
  PURCHASE_ORDERS_BUCKET,
  uploadPurchaseOrderAttachment,
  cleanupOrphanedStorageFiles,
} from "@/lib/supabase";

const DELIVERY_ALLOWED_STATUSES = ["APPROVED", "ISSUED", "PARTIALLY_DELIVERED"];

// GET /api/purchase-orders/[id]/deliveries
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized access." }, { status: 401 });
  }

  const canView = await checkSessionPermission(session, "purchaseOrders", "view");
  if (!canView) {
    return NextResponse.json(
      { success: false, error: "Forbidden: You do not have permission to view PO deliveries." },
      { status: 403 }
    );
  }

  const { id } = await params;

  try {
    const db = getPrisma();
    const po = await (db.purchaseOrder as any).findUnique({
      where: { id },
      select: { id: true, createdById: true, deletedAt: true },
    });

    if (!po || po.deletedAt) {
      return NextResponse.json({ success: false, error: "Purchase Order not found." }, { status: 404 });
    }

    const accessCheck = await canUserAccessRecord(session, "purchaseOrders", po.createdById, "view");
    if (!accessCheck.allowed) {
      return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
    }

    const deliveries = await (db.purchaseOrderDelivery as any).findMany({
      where: { purchaseOrderId: id },
      orderBy: { deliveryDate: "desc" },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            purchaseOrderItem: {
              select: { id: true, particular: true, measure: true, quantity: true },
            },
          },
        },
        attachments: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: deliveries.map((d: any) => ({
        id: d.id,
        purchaseOrderId: d.purchaseOrderId,
        deliveryReference: d.deliveryReference,
        deliveryDate: d.deliveryDate ? new Date(d.deliveryDate).toISOString().split("T")[0] : "",
        receivedBy: d.receivedBy,
        notes: d.notes || null,
        isOverride: Boolean(d.isOverride),
        overrideReason: d.overrideReason || null,
        createdById: d.createdById || null,
        createdByName: d.createdBy?.name || "System",
        items: (d.items || []).map((di: any) => ({
          id: di.id,
          deliveryId: di.deliveryId,
          purchaseOrderItemId: di.purchaseOrderItemId,
          particular: di.purchaseOrderItem?.particular || "",
          measure: di.purchaseOrderItem?.measure || "Nos",
          orderedQuantity: Number(di.purchaseOrderItem?.quantity || 0),
          deliveredQuantity: Number(di.deliveredQuantity || 0),
          notes: di.notes || null,
        })),
        attachments: (d.attachments || []).map((att: any) => ({
          id: att.id,
          purchaseOrderId: att.purchaseOrderId,
          deliveryId: att.deliveryId || null,
          category: att.category,
          fileName: att.fileName,
          fileSize: att.fileSize,
          mimeType: att.mimeType || att.fileType,
          fileUrl: `/api/purchase-orders/attachments/${att.id}`,
          createdAt: att.createdAt ? new Date(att.createdAt).toISOString() : "",
        })),
        createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : "",
      })),
    });
  } catch (err: any) {
    console.error(`GET /api/purchase-orders/${id}/deliveries error:`, err);
    return NextResponse.json(
      { success: false, error: "Failed to load deliveries." },
      { status: 500 }
    );
  }
}

// POST /api/purchase-orders/[id]/deliveries
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

    const canTrack = await checkSessionPermission(session, "purchaseOrders", "trackDelivery");
    if (!canTrack) {
      return NextResponse.json(
        { success: false, error: "Forbidden: You do not have permission to record PO deliveries." },
        { status: 403 }
      );
    }

    const { id } = await params;
    const contentType = req.headers.get("content-type") || "";
    let rawPayload: any = null;
    const filesToUpload: File[] = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const payloadStr = formData.get("payload") as string;
      if (!payloadStr) {
        return NextResponse.json(
          { success: false, error: "Missing delivery payload." },
          { status: 400 }
        );
      }
      try {
        rawPayload = JSON.parse(payloadStr);
      } catch {
        return NextResponse.json(
          { success: false, error: "Invalid JSON inside delivery payload." },
          { status: 400 }
        );
      }
      formData.getAll("files").forEach((f) => {
        if (f instanceof File && f.size > 0) filesToUpload.push(f);
      });
      formData.getAll("delivery_notes").forEach((f) => {
        if (f instanceof File && f.size > 0 && !filesToUpload.includes(f)) filesToUpload.push(f);
      });
    } else {
      try {
        rawPayload = await req.json();
      } catch {
        return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
      }
    }

    const parsed = poDeliverySchema.safeParse(rawPayload);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Delivery validation failed.",
          issues: parsed.error.flatten().fieldErrors,
        },
        { status: 422 }
      );
    }

    const input = parsed.data;
    const itemsWithPositiveQty = input.items.filter((i) => Number(i.deliveredQuantity) > 0);
    if (itemsWithPositiveQty.length === 0) {
      return NextResponse.json(
        { success: false, error: "Enter a delivered quantity greater than 0 for at least one line item." },
        { status: 422 }
      );
    }

    const db = getPrisma();
    const po = await (db.purchaseOrder as any).findFirst({
      where: { id, deletedAt: null },
      include: {
        job: { select: { id: true, jobCode: true } },
        items: { orderBy: { rowNumber: "asc" } },
      },
    });

    if (!po) {
      return NextResponse.json({ success: false, error: "Purchase Order not found." }, { status: 404 });
    }

    const accessCheck = await canUserAccessRecord(
      session,
      "purchaseOrders",
      po.createdById,
      "trackDelivery"
    );
    if (!accessCheck.allowed) {
      return NextResponse.json(
        { success: false, error: accessCheck.reason || "Forbidden: Outside your authorized scope." },
        { status: 403 }
      );
    }

    if (!DELIVERY_ALLOWED_STATUSES.includes(po.status)) {
      return NextResponse.json(
        {
          success: false,
          error: `Deliveries can only be recorded for Approved, Issued, or Partially Delivered POs (current status: ${po.status}).`,
        },
        { status: 422 }
      );
    }

    const poItemMap = new Map<string, any>();
    (po.items || []).forEach((it: any) => poItemMap.set(it.id, it));

    const canOverride = await checkSessionPermission(session, "purchaseOrders", "overrideJobBudget");
    const isAdmin = session.roles?.some((r) => r.toLowerCase() === "admin");

    let anyOverDelivery = false;
    const itemUpdates: Array<{
      poItem: any;
      addQty: number;
      newDelivered: number;
      newRemaining: number;
      notes: string | null;
    }> = [];

    for (const reqItem of itemsWithPositiveQty) {
      const targetItem = poItemMap.get(reqItem.purchaseOrderItemId);
      if (!targetItem) {
        return NextResponse.json(
          { success: false, error: `Purchase Order item "${reqItem.purchaseOrderItemId}" was not found.` },
          { status: 422 }
        );
      }

      const ordered = roundFinancial(targetItem.quantity, 4);
      const currentDelivered = roundFinancial(targetItem.deliveredQuantity || 0, 4);
      const addQty = roundFinancial(reqItem.deliveredQuantity, 4);
      const newDelivered = roundFinancial(currentDelivered.plus(addQty), 4);
      const newRemaining = roundFinancial(
        ordered.minus(newDelivered).lt(0) ? 0 : ordered.minus(newDelivered),
        4
      );

      if (newDelivered.gt(ordered.plus(0.0001))) {
        anyOverDelivery = true;
        if (!input.isOverride) {
          return NextResponse.json(
            {
              success: false,
              code: "OVER_DELIVERY_BLOCKED",
              error: `Over-delivery blocked for "${targetItem.particular}": Ordered ${ordered.toFixed(
                2
              )}, already delivered ${currentDelivered.toFixed(2)}, attempting to add ${addQty.toFixed(
                2
              )}. Enable authorized over-delivery override with a reason if intentional.`,
            },
            { status: 422 }
          );
        }
        if (!canOverride && !isAdmin) {
          return NextResponse.json(
            {
              success: false,
              code: "OVER_DELIVERY_FORBIDDEN",
              error: "Forbidden: Over-delivery requires override permission or Administrator approval.",
            },
            { status: 403 }
          );
        }
        if (!(input.overrideReason || "").trim()) {
          return NextResponse.json(
            {
              success: false,
              code: "OVERRIDE_REASON_REQUIRED",
              error: "A mandatory override reason is required when recording an over-delivery.",
            },
            { status: 422 }
          );
        }
      }

      itemUpdates.push({
        poItem: targetItem,
        addQty: addQty.toNumber(),
        newDelivered: newDelivered.toNumber(),
        newRemaining: newRemaining.toNumber(),
        notes: reqItem.notes || null,
      });
    }

    // Validate & upload delivery note attachments
    const attachmentMetaList: any[] = [];
    for (const file of filesToUpload) {
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
        category: "DELIVERY_NOTE",
        contentType: v.mimeType,
        bucket: PURCHASE_ORDERS_BUCKET,
      });

      if (!up.success) {
        if (uploadedPaths.length > 0) {
          await cleanupOrphanedStorageFiles(uploadedPaths, PURCHASE_ORDERS_BUCKET);
        }
        return NextResponse.json(
          { success: false, error: `Failed to upload delivery note "${v.sanitizedName}": ${up.error}` },
          { status: 500 }
        );
      }

      uploadedPaths.push(up.storagePath);
      attachmentMetaList.push(up);
    }

    const result = await db.$transaction(async (tx) => {
      const createdDelivery = await (tx.purchaseOrderDelivery as any).create({
        data: {
          purchaseOrderId: id,
          deliveryReference: input.deliveryReference,
          deliveryDate: new Date(input.deliveryDate),
          receivedBy: input.receivedBy,
          notes: input.notes || null,
          isOverride: anyOverDelivery && input.isOverride,
          overrideReason: anyOverDelivery && input.isOverride ? input.overrideReason || null : null,
          createdById: session.userId,
        },
      });

      const updatedDeliveredByItem = new Map<string, number>();
      for (const it of po.items || []) {
        updatedDeliveredByItem.set(it.id, Number(it.deliveredQuantity || 0));
      }

      for (const upd of itemUpdates) {
        await (tx.purchaseOrderDeliveryItem as any).create({
          data: {
            deliveryId: createdDelivery.id,
            purchaseOrderItemId: upd.poItem.id,
            deliveredQuantity: upd.addQty.toFixed(4),
            notes: upd.notes,
          },
        });

        await (tx.purchaseOrderItem as any).update({
          where: { id: upd.poItem.id },
          data: {
            deliveredQuantity: upd.newDelivered.toFixed(4),
            remainingQuantity: upd.newRemaining.toFixed(4),
          },
        });

        updatedDeliveredByItem.set(upd.poItem.id, upd.newDelivered);
      }

      for (const att of attachmentMetaList) {
        const createdAtt = await (tx.purchaseOrderAttachment as any).create({
          data: {
            purchaseOrderId: id,
            deliveryId: createdDelivery.id,
            category: "DELIVERY_NOTE",
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
        await (tx.purchaseOrderAttachment as any).update({
          where: { id: createdAtt.id },
          data: { fileUrl: `/api/purchase-orders/attachments/${createdAtt.id}` },
        });
      }

      // Evaluate overall PO delivery completion
      let allItemsFullyDelivered = true;
      for (const it of po.items || []) {
        const ordered = toDecimal(it.quantity);
        const deliv = toDecimal(updatedDeliveredByItem.get(it.id) || 0);
        if (deliv.lt(ordered.minus(0.0001))) {
          allItemsFullyDelivered = false;
          break;
        }
      }

      const nextDeliveryStatus = allItemsFullyDelivered ? "DELIVERED" : "PARTIALLY_DELIVERED";
      const nextPoStatus = allItemsFullyDelivered ? "DELIVERED" : "PARTIALLY_DELIVERED";

      const updatedPo = await (tx.purchaseOrder as any).update({
        where: { id },
        data: {
          deliveryStatus: nextDeliveryStatus,
          status: nextPoStatus,
          updatedById: session.userId,
        },
      });

      await (tx.purchaseOrderAuditLog as any).create({
        data: {
          purchaseOrderId: id,
          userId: session.userId,
          action: "DELIVER",
          reason: anyOverDelivery ? input.overrideReason || "Over-delivery override" : input.notes || null,
          previousData: { status: po.status, deliveryStatus: po.deliveryStatus },
          newData: {
            deliveryId: createdDelivery.id,
            deliveryReference: input.deliveryReference,
            status: nextPoStatus,
            deliveryStatus: nextDeliveryStatus,
            deliveredItemCount: itemUpdates.length,
          },
        },
      });

      return { createdDelivery, updatedPo };
    });

    await logAuditEvent({
      userId: session.userId,
      action: "RECORD_PO_DELIVERY",
      resource: "purchaseOrders",
      resourceId: id,
      details: {
        poNumber: po.poNumber,
        deliveryReference: input.deliveryReference,
        newStatus: result.updatedPo.status,
        attachmentsCount: attachmentMetaList.length,
      },
      req,
    });

    return NextResponse.json(
      {
        success: true,
        message: `Delivery "${input.deliveryReference}" recorded. PO status is now ${result.updatedPo.status}.`,
        data: {
          delivery: result.createdDelivery,
          poStatus: result.updatedPo.status,
          deliveryStatus: result.updatedPo.deliveryStatus,
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    if (uploadedPaths.length > 0) {
      await cleanupOrphanedStorageFiles(uploadedPaths, PURCHASE_ORDERS_BUCKET);
    }
    console.error("POST /api/purchase-orders/[id]/deliveries error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to record PO delivery." },
      { status: 500 }
    );
  }
}
