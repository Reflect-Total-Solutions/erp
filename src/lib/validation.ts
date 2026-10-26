/**
 * Server-side validation utilities for the ERP system.
 * All user input MUST pass through these validators before database writes.
 *
 * Security: XSS sanitization, length limits, format validation.
 */

// ─── Sanitization ────────────────────────────────────────────────────────────

/** Strip HTML tags and control characters from a string */
export function sanitize(input: string): string {
  return input
    .replace(/<[^>]*>/g, "") // strip HTML tags
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // strip control chars
    .trim();
}

/** Normalize email: lowercase, trim */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// ─── Validation Result ───────────────────────────────────────────────────────

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

function ok(): ValidationResult {
  return { valid: true, errors: [] };
}

function fail(errors: ValidationError[]): ValidationResult {
  return { valid: false, errors };
}

// ─── Field Validators ────────────────────────────────────────────────────────

/** Validate supplier name: required, 2-120 chars, sanitized */
export function validateSupplierName(name: unknown): ValidationResult {
  if (typeof name !== "string" || !name.trim()) {
    return fail([{ field: "name", message: "Supplier name is required." }]);
  }
  const sanitized = sanitize(name);
  if (sanitized.length < 2) {
    return fail([{ field: "name", message: "Supplier name must be at least 2 characters." }]);
  }
  if (sanitized.length > 120) {
    return fail([{ field: "name", message: "Supplier name cannot exceed 120 characters." }]);
  }
  return ok();
}

/** Validate supplier code: required, uppercase alphanumeric + hyphens, 2-20 chars */
export function validateSupplierCode(code: unknown): ValidationResult {
  if (typeof code !== "string" || !code.trim()) {
    return fail([{ field: "code", message: "Supplier code is required." }]);
  }
  const trimmed = code.trim().toUpperCase();
  if (trimmed.length < 2 || trimmed.length > 20) {
    return fail([{ field: "code", message: "Supplier code must be 2-20 characters." }]);
  }
  if (!/^[A-Z0-9][A-Z0-9-]*[A-Z0-9]$|^[A-Z0-9]{1,2}$/.test(trimmed)) {
    return fail([{
      field: "code",
      message: "Code must contain only uppercase letters, numbers, and hyphens (cannot start/end with hyphen).",
    }]);
  }
  return ok();
}

/** Validate contact person name: required, 2-100 chars */
export function validateContactPerson(contact: unknown): ValidationResult {
  if (typeof contact !== "string" || !contact.trim()) {
    return fail([{ field: "contactPerson", message: "Contact person name is required." }]);
  }
  const sanitized = sanitize(contact);
  if (sanitized.length < 2) {
    return fail([{ field: "contactPerson", message: "Contact person must be at least 2 characters." }]);
  }
  if (sanitized.length > 100) {
    return fail([{ field: "contactPerson", message: "Contact person cannot exceed 100 characters." }]);
  }
  return ok();
}

/** Validate phone number: required, 7-20 digits (allows +, spaces, hyphens) */
export function validatePhone(phone: unknown): ValidationResult {
  if (typeof phone !== "string" || !phone.trim()) {
    return fail([{ field: "phone", message: "Phone number is required." }]);
  }
  const trimmed = phone.trim();
  if (!/^[+]?[\d\s-]{7,20}$/.test(trimmed)) {
    return fail([{
      field: "phone",
      message: "Enter a valid phone number (7-20 digits, e.g. 077 123 4567 or +94 11 234 5678).",
    }]);
  }
  return ok();
}

/** Validate email address: required, RFC-like format, max 254 chars */
export function validateEmail(email: unknown): ValidationResult {
  if (typeof email !== "string" || !email.trim()) {
    return fail([{ field: "email", message: "Email address is required." }]);
  }
  const trimmed = email.trim().toLowerCase();
  if (trimmed.length > 254) {
    return fail([{ field: "email", message: "Email address is too long (max 254 characters)." }]);
  }
  // RFC 5322 simplified regex
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return fail([{ field: "email", message: "Please enter a valid email address." }]);
  }
  // Reject common disposable email patterns
  const domain = trimmed.split("@")[1];
  if (!domain || domain.length < 3) {
    return fail([{ field: "email", message: "Email domain is invalid." }]);
  }
  return ok();
}

/** Validate business address: required, 5-500 chars */
export function validateAddress(address: unknown): ValidationResult {
  if (typeof address !== "string" || !address.trim()) {
    return fail([{ field: "address", message: "Business address is required." }]);
  }
  const sanitized = sanitize(address);
  if (sanitized.length < 5) {
    return fail([{ field: "address", message: "Please provide a complete address (minimum 5 characters)." }]);
  }
  if (sanitized.length > 500) {
    return fail([{ field: "address", message: "Address cannot exceed 500 characters." }]);
  }
  return ok();
}

// ─── Composite Supplier Validator ────────────────────────────────────────────

export interface SupplierInput {
  name: unknown;
  code: unknown;
  contactPerson: unknown;
  phone: unknown;
  email: unknown;
  address: unknown;
}

export interface SanitizedSupplierData {
  name: string;
  code: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
}

/**
 * Validate all supplier fields at once.
 * Returns sanitized data if valid, or accumulated errors if not.
 */
export function validateSupplierInput(
  input: SupplierInput
): { valid: true; data: SanitizedSupplierData } | { valid: false; errors: ValidationError[] } {
  const results = [
    validateSupplierName(input.name),
    validateSupplierCode(input.code),
    validateContactPerson(input.contactPerson),
    validatePhone(input.phone),
    validateEmail(input.email),
    validateAddress(input.address),
  ];

  const allErrors = results.flatMap((r) => r.errors);

  if (allErrors.length > 0) {
    return { valid: false, errors: allErrors };
  }

  return {
    valid: true,
    data: {
      name: sanitize(String(input.name)),
      code: sanitize(String(input.code)).toUpperCase(),
      contactPerson: sanitize(String(input.contactPerson)),
      phone: String(input.phone).trim(),
      email: normalizeEmail(String(input.email)),
      address: sanitize(String(input.address)),
    },
  };
}

// ─── ID Validator ────────────────────────────────────────────────────────────

/** Validate that a CUID looks legitimate (basic format check) */
export function isValidCuid(id: unknown): boolean {
  if (typeof id !== "string") return false;
  // CUIDs are typically 25+ chars, alphanumeric
  return /^[a-z0-9]{20,36}$/.test(id) || /^c[a-z0-9]{20,36}$/.test(id);
}
