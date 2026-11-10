import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ctydjqzhrxcekkdltgul.supabase.co";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_BFzAtpvLrYajArICv51mkg_P7sUCpwm";
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "sb_secret_0oQdFKZ32lD1WqmS1WqFxQ_4HLHhqob";

export const DEFAULT_STORAGE_BUCKET =
  process.env.SUPABASE_STORAGE_BUCKET || "erp-documents";

export const SUPPLIER_INVOICES_BUCKET = "supplier-invoices";
export const PURCHASE_ORDERS_BUCKET = "purchase-orders";

let adminClientInstance: SupabaseClient | null = null;
let publicClientInstance: SupabaseClient | null = null;

/**
 * Returns a Supabase client with admin/service-role privileges for server operations.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!adminClientInstance) {
    adminClientInstance = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return adminClientInstance;
}

/**
 * Returns a standard Supabase client for client-side or anon usage.
 */
export function getSupabaseClient(): SupabaseClient {
  if (!publicClientInstance) {
    publicClientInstance = createClient(supabaseUrl, supabaseAnonKey);
  }
  return publicClientInstance;
}

/**
 * Ensures a storage bucket exists.
 */
export async function ensureStorageBucket(
  bucketName = SUPPLIER_INVOICES_BUCKET,
  isPublic = false
): Promise<boolean> {
  const admin = getSupabaseAdmin();
  try {
    const { data: buckets, error: listErr } = await admin.storage.listBuckets();
    if (listErr) {
      console.warn("Supabase listBuckets warning:", listErr.message);
      return false;
    }

    const exists = buckets?.some((b) => b.name === bucketName);
    if (!exists) {
      const { error: createErr } = await admin.storage.createBucket(bucketName, {
        public: isPublic,
      });
      if (createErr) {
        console.error(`Failed to create Supabase bucket "${bucketName}":`, createErr.message);
        return false;
      }
    }
    return true;
  } catch (err) {
    console.error("ensureStorageBucket exception:", err);
    return false;
  }
}

export interface UploadResult {
  success: boolean;
  fileUrl: string;
  signedUrl?: string;
  storagePath: string;
  bucketName: string;
  fileName: string;
  storedFileName: string;
  originalFileName: string;
  fileSize: string;
  mimeType: string;
  error?: string;
}

/**
 * Uploads a supplier invoice attachment to Supabase Storage using the structured folder hierarchy:
 * supplier-invoices / [JOB-CODE] / [INV-NUMBER] / item-[ROW-OR-ID] / [TIMESTAMP-RANDOM_FILENAME]
 */
export async function uploadSupplierInvoiceAttachment({
  buffer,
  originalName,
  jobCode,
  invoiceNumber,
  rowNumberOrItemId,
  contentType,
  bucket = SUPPLIER_INVOICES_BUCKET,
}: {
  buffer: Buffer | Uint8Array | ArrayBuffer;
  originalName: string;
  jobCode: string;
  invoiceNumber: string;
  rowNumberOrItemId: string | number;
  contentType: string;
  bucket?: string;
}): Promise<UploadResult> {
  try {
    await ensureStorageBucket(bucket, false);
    const admin = getSupabaseAdmin();

    // Sanitize folder path segments
    const cleanJobCode = (jobCode || "JOB").replace(/[^a-zA-Z0-9_-]/g, "_");
    const cleanInvNumber = (invoiceNumber || "INV").replace(/[^a-zA-Z0-9_-]/g, "_");
    const cleanItemSegment = `item-${String(rowNumberOrItemId).replace(/[^a-zA-Z0-9_-]/g, "_")}`;

    // Sanitize file name and create unique stored name
    const cleanOriginalName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const uniquePrefix = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const storedFileName = `${uniquePrefix}_${cleanOriginalName}`;

    // Hierarchical path: JOB-2026-001 / INV-2026-001 / item-001 / storedFileName
    const storagePath = `${cleanJobCode}/${cleanInvNumber}/${cleanItemSegment}/${storedFileName}`;

    const byteLength = buffer instanceof Buffer ? buffer.length : (buffer as ArrayBuffer).byteLength;
    const sizeKB = Math.round(byteLength / 1024);
    const formattedSize =
      sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB || 1} KB`;

    const { error: uploadError } = await admin.storage
      .from(bucket)
      .upload(storagePath, buffer, {
        contentType: contentType || "application/octet-stream",
        upsert: true,
      });

    if (uploadError) {
      console.error("Supabase Storage upload error:", uploadError);
      return {
        success: false,
        fileUrl: "",
        storagePath: "",
        bucketName: bucket,
        fileName: cleanOriginalName,
        storedFileName: "",
        originalFileName: cleanOriginalName,
        fileSize: formattedSize,
        mimeType: contentType,
        error: uploadError.message,
      };
    }

    // Generate signed URL with 1-hour expiry (3600 seconds)
    const { data: signedData } = await admin.storage
      .from(bucket)
      .createSignedUrl(storagePath, 3600);

    const signedUrl = signedData?.signedUrl || "";

    return {
      success: true,
      fileUrl: signedUrl, // Provides immediate direct access URL
      signedUrl,
      storagePath,
      bucketName: bucket,
      fileName: cleanOriginalName,
      storedFileName,
      originalFileName: cleanOriginalName,
      fileSize: formattedSize,
      mimeType: contentType,
    };
  } catch (err: any) {
    console.error("uploadSupplierInvoiceAttachment exception:", err);
    return {
      success: false,
      fileUrl: "",
      storagePath: "",
      bucketName: bucket,
      fileName: originalName,
      storedFileName: "",
      originalFileName: originalName,
      fileSize: "0 KB",
      mimeType: contentType,
      error: err?.message || "Unknown error during attachment upload",
    };
  }
}

/**
 * Uploads a Purchase Order attachment to Supabase Storage:
 * purchase-orders / [JOB-CODE] / [PO-NUMBER] / [CATEGORY] / [TIMESTAMP-RAND_FILENAME]
 */
export async function uploadPurchaseOrderAttachment({
  buffer,
  originalName,
  jobCode,
  poNumber,
  category = "PO_DOCUMENT",
  contentType,
  bucket = PURCHASE_ORDERS_BUCKET,
}: {
  buffer: Buffer | Uint8Array | ArrayBuffer;
  originalName: string;
  jobCode: string;
  poNumber: string;
  category?: string;
  contentType: string;
  bucket?: string;
}): Promise<UploadResult> {
  try {
    await ensureStorageBucket(bucket, false);
    const admin = getSupabaseAdmin();

    const cleanJobCode = (jobCode || "JOB").replace(/[^a-zA-Z0-9_-]/g, "_");
    const cleanPoNumber = (poNumber || "PO").replace(/[^a-zA-Z0-9_-]/g, "_");
    const cleanCategory = (category || "PO_DOCUMENT").replace(/[^a-zA-Z0-9_-]/g, "_");

    const cleanOriginalName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const uniquePrefix = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const storedFileName = `${uniquePrefix}_${cleanOriginalName}`;

    const storagePath = `${cleanJobCode}/${cleanPoNumber}/${cleanCategory}/${storedFileName}`;

    const byteLength = buffer instanceof Buffer ? buffer.length : (buffer as ArrayBuffer).byteLength;
    const sizeKB = Math.round(byteLength / 1024);
    const formattedSize =
      sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB || 1} KB`;

    const { error: uploadError } = await admin.storage
      .from(bucket)
      .upload(storagePath, buffer, {
        contentType: contentType || "application/octet-stream",
        upsert: true,
      });

    if (uploadError) {
      console.error("Supabase PO Storage upload error:", uploadError);
      return {
        success: false,
        fileUrl: "",
        storagePath: "",
        bucketName: bucket,
        fileName: cleanOriginalName,
        storedFileName: "",
        originalFileName: cleanOriginalName,
        fileSize: formattedSize,
        mimeType: contentType,
        error: uploadError.message,
      };
    }

    const { data: signedData } = await admin.storage
      .from(bucket)
      .createSignedUrl(storagePath, 3600);

    const signedUrl = signedData?.signedUrl || "";

    return {
      success: true,
      fileUrl: signedUrl,
      signedUrl,
      storagePath,
      bucketName: bucket,
      fileName: cleanOriginalName,
      storedFileName,
      originalFileName: cleanOriginalName,
      fileSize: formattedSize,
      mimeType: contentType,
    };
  } catch (err: any) {
    console.error("uploadPurchaseOrderAttachment exception:", err);
    return {
      success: false,
      fileUrl: "",
      storagePath: "",
      bucketName: bucket,
      fileName: originalName,
      storedFileName: "",
      originalFileName: originalName,
      fileSize: "0 KB",
      mimeType: contentType,
      error: err?.message || "Unknown error during PO attachment upload",
    };
  }
}

/**
 * Creates a signed URL for a private attachment in Supabase Storage.
 */
export async function createAttachmentSignedUrl(
  storagePath: string,
  expiresIn = 3600,
  bucket = SUPPLIER_INVOICES_BUCKET
): Promise<string | null> {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.storage
      .from(bucket)
      .createSignedUrl(storagePath, expiresIn);

    if (error || !data?.signedUrl) {
      console.warn("createAttachmentSignedUrl warning:", error?.message);
      return null;
    }
    return data.signedUrl;
  } catch (err) {
    console.error("createAttachmentSignedUrl exception:", err);
    return null;
  }
}

/**
 * Downloads a file buffer from Supabase Storage (used for server-side ZIP generation).
 */
export async function downloadAttachmentFromStorage(
  storagePath: string,
  bucket = SUPPLIER_INVOICES_BUCKET
): Promise<{ success: boolean; data?: Blob; error?: string }> {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.storage.from(bucket).download(storagePath);
    if (error || !data) {
      return { success: false, error: error?.message || "Download failed" };
    }
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err?.message || "Exception downloading file" };
  }
}

/**
 * Deletes a single file from Supabase Storage.
 */
export async function deleteFromSupabaseStorage(
  storagePath: string,
  bucket = SUPPLIER_INVOICES_BUCKET
): Promise<boolean> {
  try {
    const admin = getSupabaseAdmin();
    const { error } = await admin.storage.from(bucket).remove([storagePath]);
    if (error) {
      console.warn("Supabase remove warning:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("deleteFromSupabaseStorage exception:", err);
    return false;
  }
}

/**
 * Cleans up multiple newly uploaded files from Supabase Storage if the database transaction fails.
 */
export async function cleanupOrphanedStorageFiles(
  storagePaths: string[],
  bucket = SUPPLIER_INVOICES_BUCKET
): Promise<void> {
  if (!storagePaths || storagePaths.length === 0) return;
  try {
    const admin = getSupabaseAdmin();
    await admin.storage.from(bucket).remove(storagePaths);
    console.log(`Cleaned up ${storagePaths.length} orphaned files from Supabase Storage.`);
  } catch (err) {
    console.warn("Failed to cleanup orphaned storage files:", err);
  }
}

/**
 * Generic upload function to Supabase Storage for general files (e.g. Job Documents, Excel uploads).
 */
export async function uploadToSupabaseStorage({
  buffer,
  originalName,
  folder = "uploads",
  contentType = "application/octet-stream",
  bucket = DEFAULT_STORAGE_BUCKET,
}: {
  buffer: Buffer | Uint8Array | ArrayBuffer;
  originalName: string;
  folder?: string;
  contentType?: string;
  bucket?: string;
}): Promise<UploadResult> {
  try {
    await ensureStorageBucket(bucket, false);
    const admin = getSupabaseAdmin();

    const cleanFolder = (folder || "uploads").replace(/^\/+|\/+$/g, "");
    const cleanOriginalName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const uniquePrefix = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const storedFileName = `${uniquePrefix}_${cleanOriginalName}`;
    const storagePath = `${cleanFolder}/${storedFileName}`;

    const byteLength = buffer instanceof Buffer ? buffer.length : (buffer as ArrayBuffer).byteLength;
    const sizeKB = Math.round(byteLength / 1024);
    const formattedSize =
      sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB || 1} KB`;

    const { error: uploadError } = await admin.storage
      .from(bucket)
      .upload(storagePath, buffer, {
        contentType: contentType || "application/octet-stream",
        upsert: true,
      });

    if (uploadError) {
      console.error("Supabase Storage upload error:", uploadError);
      return {
        success: false,
        fileUrl: "",
        storagePath: "",
        bucketName: bucket,
        fileName: cleanOriginalName,
        storedFileName: "",
        originalFileName: cleanOriginalName,
        fileSize: formattedSize,
        mimeType: contentType,
        error: uploadError.message,
      };
    }

    const { data: signedData } = await admin.storage
      .from(bucket)
      .createSignedUrl(storagePath, 86400 * 7);

    const signedUrl = signedData?.signedUrl || "";

    return {
      success: true,
      fileUrl: signedUrl,
      signedUrl,
      storagePath,
      bucketName: bucket,
      fileName: cleanOriginalName,
      storedFileName,
      originalFileName: cleanOriginalName,
      fileSize: formattedSize,
      mimeType: contentType,
    };
  } catch (err: any) {
    console.error("uploadToSupabaseStorage exception:", err);
    return {
      success: false,
      fileUrl: "",
      storagePath: "",
      bucketName: bucket,
      fileName: originalName,
      storedFileName: "",
      originalFileName: originalName,
      fileSize: "0 KB",
      mimeType: contentType,
      error: err?.message || "Unknown error during upload",
    };
  }
}

