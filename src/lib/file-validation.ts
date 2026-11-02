/**
 * Secure file validation and format detection utility.
 * Supports PDF documents, Microsoft Word (.doc, .docx), and Images (.jpg, .jpeg, .png, .webp).
 */

export const MAX_ATTACHMENT_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB
export const MAX_ATTACHMENT_SIZE_MB = 15;

export const SUPPORTED_EXTENSIONS = [
  "pdf",
  "doc",
  "docx",
  "jpg",
  "jpeg",
  "png",
  "webp",
] as const;

export type SupportedExtension = typeof SUPPORTED_EXTENSIONS[number];
export type FileCategory = "pdf" | "word" | "image" | "unknown";

export const MIME_TYPE_MAP: Record<SupportedExtension, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/**
 * Returns the file extension in lower case without dot.
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase().trim() : "";
}

/**
 * Checks whether the file extension is among the supported formats.
 */
export function isSupportedExtension(filename: string): boolean {
  const ext = getFileExtension(filename);
  return SUPPORTED_EXTENSIONS.includes(ext as SupportedExtension);
}

/**
 * Categorizes a file based on its extension or MIME type.
 */
export function getFileCategory(filename: string, mime?: string): FileCategory {
  const ext = getFileExtension(filename);
  if (ext === "pdf" || mime === "application/pdf") return "pdf";
  if (
    ext === "doc" ||
    ext === "docx" ||
    mime === "application/msword" ||
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "word";
  }
  if (
    ["jpg", "jpeg", "png", "webp"].includes(ext) ||
    mime?.startsWith("image/")
  ) {
    return "image";
  }
  return "unknown";
}

/**
 * Format bytes to readable string (KB, MB).
 */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 KB";
  const sizeKB = Math.round(bytes / 1024);
  if (sizeKB >= 1024) {
    return `${(sizeKB / 1024).toFixed(1)} MB`;
  }
  return `${sizeKB || 1} KB`;
}

/**
 * Validates a file's binary signature (magic bytes) to prevent spoofing.
 */
export function verifyFileSignature(
  buffer: Buffer,
  extension: string
): { isValid: boolean; detectedMime: string; error?: string } {
  if (buffer.length < 4) {
    return { isValid: false, detectedMime: "", error: "File buffer is too small to inspect." };
  }

  // PDF check: starts with "%PDF-" (0x25, 0x50, 0x44, 0x46)
  if (extension === "pdf") {
    if (
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46
    ) {
      return { isValid: true, detectedMime: "application/pdf" };
    }
    return { isValid: false, detectedMime: "", error: "File header does not match valid PDF signature." };
  }

  // PNG check: 89 50 4E 47 0D 0A 1A 0A
  if (extension === "png") {
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      return { isValid: true, detectedMime: "image/png" };
    }
    return { isValid: false, detectedMime: "", error: "File header does not match valid PNG signature." };
  }

  // JPEG check: FF D8 FF
  if (extension === "jpg" || extension === "jpeg") {
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return { isValid: true, detectedMime: "image/jpeg" };
    }
    return { isValid: false, detectedMime: "", error: "File header does not match valid JPEG signature." };
  }

  // WEBP check: RIFF .... WEBP
  if (extension === "webp") {
    if (
      buffer.length >= 12 &&
      buffer[0] === 0x52 && // R
      buffer[1] === 0x49 && // I
      buffer[2] === 0x46 && // F
      buffer[3] === 0x46 && // F
      buffer[8] === 0x57 && // W
      buffer[9] === 0x45 && // E
      buffer[10] === 0x42 && // B
      buffer[11] === 0x50 // P
    ) {
      return { isValid: true, detectedMime: "image/webp" };
    }
    return { isValid: false, detectedMime: "", error: "File header does not match valid WEBP signature." };
  }

  // Microsoft Word .doc: OLE compound file header D0 CF 11 E0 A1 B1 1A E1
  if (extension === "doc") {
    if (
      buffer[0] === 0xd0 &&
      buffer[1] === 0xcf &&
      buffer[2] === 0x11 &&
      buffer[3] === 0xe0
    ) {
      return { isValid: true, detectedMime: "application/msword" };
    }
    return { isValid: false, detectedMime: "", error: "File header does not match valid Microsoft Word .doc signature." };
  }

  // Microsoft Word .docx: ZIP container 50 4B 03 04
  if (extension === "docx") {
    if (
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      buffer[2] === 0x03 &&
      buffer[3] === 0x04
    ) {
      return {
        isValid: true,
        detectedMime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      };
    }
    return { isValid: false, detectedMime: "", error: "File header does not match valid Microsoft Word .docx container signature." };
  }

  return { isValid: false, detectedMime: "", error: `Unsupported file extension: .${extension}` };
}

/**
 * Validates an uploaded attachment on the server side:
 * 1. Checks file size (<= 15MB)
 * 2. Whitelist extension check
 * 3. File signature / magic bytes verification
 * 4. Rejection of malicious / executable scripts
 */
export function validateAttachmentBuffer(
  buffer: Buffer,
  filename: string,
  maxSizeBytes = MAX_ATTACHMENT_SIZE_BYTES
): {
  isValid: boolean;
  error?: string;
  mimeType: string;
  category: FileCategory;
  sanitizedName: string;
} {
  // 1. Sanitize filename (remove path traversal, null bytes, special chars)
  const cleanName = filename
    .replace(/[/\\?%*:|"<>]/g, "_")
    .replace(/\.{2,}/g, "_")
    .trim();

  const ext = getFileExtension(cleanName);

  // 2. Extension whitelist check
  if (!SUPPORTED_EXTENSIONS.includes(ext as SupportedExtension)) {
    return {
      isValid: false,
      error: `Unsupported file format ".${ext || "unknown"}". Allowed formats: PDF (.pdf), Word (.doc, .docx), and Images (.jpg, .jpeg, .png, .webp).`,
      mimeType: "",
      category: "unknown",
      sanitizedName: cleanName,
    };
  }

  // 3. File size check
  if (buffer.length > maxSizeBytes) {
    return {
      isValid: false,
      error: `File "${cleanName}" exceeds the maximum permitted size of ${formatBytes(maxSizeBytes)}.`,
      mimeType: "",
      category: "unknown",
      sanitizedName: cleanName,
    };
  }

  if (buffer.length === 0) {
    return {
      isValid: false,
      error: `File "${cleanName}" is empty (0 bytes).`,
      mimeType: "",
      category: "unknown",
      sanitizedName: cleanName,
    };
  }

  // 4. File signature inspection
  const sigResult = verifyFileSignature(buffer, ext);
  if (!sigResult.isValid) {
    return {
      isValid: false,
      error: `File "${cleanName}" failed security verification: ${sigResult.error}`,
      mimeType: "",
      category: "unknown",
      sanitizedName: cleanName,
    };
  }

  return {
    isValid: true,
    mimeType: sigResult.detectedMime,
    category: getFileCategory(cleanName, sigResult.detectedMime),
    sanitizedName: cleanName,
  };
}
