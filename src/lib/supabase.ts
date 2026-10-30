import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ctydjqzhrxcekkdltgul.supabase.co";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_BFzAtpvLrYajArICv51mkg_P7sUCpwm";
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "sb_secret_0oQdFKZ32lD1WqmS1WqFxQ_4HLHhqob";

export const DEFAULT_STORAGE_BUCKET =
  process.env.SUPABASE_STORAGE_BUCKET || "erp-documents";

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
 * Ensures the target storage bucket exists and is set to public.
 */
export async function ensureStorageBucket(bucketName = DEFAULT_STORAGE_BUCKET): Promise<boolean> {
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
        public: true,
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
  storagePath: string;
  fileName: string;
  fileSize: string;
  error?: string;
}

/**
 * Uploads a file buffer or blob to Supabase Storage and returns its public URL and metadata.
 */
export async function uploadToSupabaseStorage({
  buffer,
  originalName,
  folder = "documents",
  contentType,
  bucket = DEFAULT_STORAGE_BUCKET,
}: {
  buffer: Buffer | Uint8Array | ArrayBuffer;
  originalName: string;
  folder?: string;
  contentType?: string;
  bucket?: string;
}): Promise<UploadResult> {
  try {
    await ensureStorageBucket(bucket);
    const admin = getSupabaseAdmin();

    // Sanitize file name to avoid invalid URL characters
    const cleanName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const uniquePrefix = `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const storagePath = `${folder}/${uniquePrefix}-${cleanName}`.replace(/\/+/g, "/");

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
        fileName: originalName,
        fileSize: formattedSize,
        error: uploadError.message,
      };
    }

    const { data: publicUrlData } = admin.storage.from(bucket).getPublicUrl(storagePath);
    const fileUrl = publicUrlData.publicUrl;

    return {
      success: true,
      fileUrl,
      storagePath,
      fileName: originalName,
      fileSize: formattedSize,
    };
  } catch (err: any) {
    console.error("uploadToSupabaseStorage exception:", err);
    return {
      success: false,
      fileUrl: "",
      storagePath: "",
      fileName: originalName,
      fileSize: "0 KB",
      error: err?.message || "Unknown error during upload",
    };
  }
}

/**
 * Deletes a file from Supabase Storage.
 */
export async function deleteFromSupabaseStorage(
  storagePath: string,
  bucket = DEFAULT_STORAGE_BUCKET
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
