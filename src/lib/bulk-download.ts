import JSZip from "jszip";
import { SupplierInvoice } from "@/types/admin";

export interface BulkDownloadProgress {
  totalFiles: number;
  completedFiles: number;
  percent: number;
  currentFileName: string;
}

/**
 * Downloads all attachments (PDF, Word docs, Images) from selected supplier invoices
 * and packages them into a structured ZIP archive.
 *
 * Folder structure:
 * [InvoiceNumber]_[SupplierName] / [RowNumber]_[Description] / [FileName]
 */
export async function downloadInvoicesAsZip(
  invoices: SupplierInvoice[],
  onProgress?: (progress: BulkDownloadProgress) => void
): Promise<{ success: boolean; totalFiles: number; error?: string }> {
  try {
    if (!invoices || invoices.length === 0) {
      throw new Error("No invoices selected for bulk download.");
    }

    const zip = new JSZip();
    const usedPaths = new Set<string>();

    // Collect all attachments across selected invoices
    const itemsToDownload: Array<{
      folderPath: string;
      originalName: string;
      fileUrl: string;
    }> = [];

    invoices.forEach((inv) => {
      const cleanSupplier = (inv.supplierName || "Supplier").replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 30);
      const cleanInvNum = (inv.invoiceNumber || "INV").replace(/[^a-zA-Z0-9_-]/g, "_");
      const baseInvoiceFolder = `${cleanInvNum}_${cleanSupplier}`;

      // 1. Check item-level attachments
      const processedAttachmentIds = new Set<string>();

      (inv.items || []).forEach((item, itemIdx) => {
        const cleanDesc = (item.description || `Row_${itemIdx + 1}`)
          .replace(/[^a-zA-Z0-9_-]/g, "_")
          .substring(0, 40);
        const rowFolder = `${baseInvoiceFolder}/Row${item.rowNumber || itemIdx + 1}_${cleanDesc}`;

        (item.attachments || []).forEach((att) => {
          if (att && att.fileUrl) {
            processedAttachmentIds.add(att.id || att.fileUrl);
            itemsToDownload.push({
              folderPath: rowFolder,
              originalName: att.fileName || "attachment",
              fileUrl: att.fileUrl,
            });
          }
        });
      });

      // 2. Also check top-level invoice attachments that might not be attached to an item
      (inv.attachments || []).forEach((att) => {
        const key = att.id || att.fileUrl;
        if (att && att.fileUrl && !processedAttachmentIds.has(key)) {
          processedAttachmentIds.add(key);
          itemsToDownload.push({
            folderPath: `${baseInvoiceFolder}/General_Attachments`,
            originalName: att.fileName || "invoice_document",
            fileUrl: att.fileUrl,
          });
        }
      });
    });

    if (itemsToDownload.length === 0) {
      throw new Error("None of the selected invoices have uploaded attachments (PDF, Word, or Images) to download.");
    }

    const totalFiles = itemsToDownload.length;
    let completedFiles = 0;

    for (let i = 0; i < itemsToDownload.length; i++) {
      const item = itemsToDownload[i];
      if (onProgress) {
        onProgress({
          totalFiles,
          completedFiles,
          percent: Math.round((completedFiles / totalFiles) * 100),
          currentFileName: item.originalName,
        });
      }

      try {
        const response = await fetch(item.fileUrl);
        if (!response.ok) {
          console.warn(`Could not fetch attachment from "${item.fileUrl}": ${response.statusText}`);
          continue;
        }

        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();

        // Ensure unique filename inside folder to prevent collisions
        let finalFileName = item.originalName;
        let candidatePath = `${item.folderPath}/${finalFileName}`;
        let counter = 1;

        const nameParts = item.originalName.split(".");
        const ext = nameParts.length > 1 ? "." + nameParts.pop() : "";
        const baseName = nameParts.join(".");

        while (usedPaths.has(candidatePath.toLowerCase())) {
          finalFileName = `${baseName} (${counter})${ext}`;
          candidatePath = `${item.folderPath}/${finalFileName}`;
          counter++;
        }
        usedPaths.add(candidatePath.toLowerCase());

        // Add file into folder
        const targetFolder = zip.folder(item.folderPath) || zip;
        targetFolder.file(finalFileName, arrayBuffer);
        completedFiles++;
      } catch (fetchErr) {
        console.warn(`Failed fetching ${item.originalName}:`, fetchErr);
      }

      if (onProgress) {
        onProgress({
          totalFiles,
          completedFiles,
          percent: Math.round((completedFiles / totalFiles) * 100),
          currentFileName: item.originalName,
        });
      }
    }

    if (completedFiles === 0) {
      throw new Error("Failed to download any attachment files from storage.");
    }

    // Generate ZIP blob
    const zipBlob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    // Trigger browser download
    const dateStr = new Date().toISOString().split("T")[0];
    const zipFileName = `Supplier_Invoices_Attachments_${dateStr}.zip`;

    const downloadUrl = URL.createObjectURL(zipBlob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = zipFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);

    return {
      success: true,
      totalFiles: completedFiles,
    };
  } catch (err: any) {
    console.error("downloadInvoicesAsZip error:", err);
    return {
      success: false,
      totalFiles: 0,
      error: err?.message || "Failed to package and download invoice archive.",
    };
  }
}

/**
 * Downloads all attachments for a single invoice as a ZIP.
 */
export async function downloadSingleInvoiceZip(
  invoice: SupplierInvoice,
  onProgress?: (progress: BulkDownloadProgress) => void
) {
  return downloadInvoicesAsZip([invoice], onProgress);
}
