import { z } from "zod";

// Regular expressions for strict validation
// Supports Sri Lankan formats (0771234567, +94771234567, 0112345678) and international E.164 formats
const PHONE_REGEX = /^(?:0|\+94|\+)?(?:[1-9]\d{1}|7[0-8]\d{1})\s?\d{3}\s?\d{4}$|^[+]?[\d\s-]{7,20}$/;
const CODE_REGEX = /^[A-Z0-9-]+$/;
const NO_HTML_REGEX = /^[^<>]*$/;

export const supplierCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .transform((val) => val.toUpperCase())
    .pipe(
      z
        .string()
        .min(2, "Supplier code must be at least 2 characters.")
        .max(20, "Supplier code cannot exceed 20 characters.")
        .regex(CODE_REGEX, "Code must contain only uppercase letters, numbers, and hyphens (e.g. SUP-01).")
    ),
  name: z
    .string()
    .trim()
    .min(2, "Supplier company name must be at least 2 characters.")
    .max(100, "Supplier company name cannot exceed 100 characters.")
    .regex(NO_HTML_REGEX, "Name contains invalid characters."),
  contactPerson: z
    .string()
    .trim()
    .min(2, "Contact person name must be at least 2 characters.")
    .max(80, "Contact person name cannot exceed 80 characters.")
    .regex(NO_HTML_REGEX, "Contact person contains invalid characters."),
  phone: z
    .string()
    .trim()
    .min(7, "Phone number must be at least 7 digits.")
    .max(20, "Phone number cannot exceed 20 digits.")
    .regex(PHONE_REGEX, "Please enter a valid phone number (e.g. 077 123 4567 or +94 11 234 5678)."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid RFC-compliant email address (e.g. supplier@company.com).")
    .max(120, "Email address cannot exceed 120 characters."),
  address: z
    .string()
    .trim()
    .min(5, "Complete address must be at least 5 characters.")
    .max(250, "Address cannot exceed 250 characters.")
    .regex(NO_HTML_REGEX, "Address contains invalid characters."),
  taxId: z
    .string()
    .trim()
    .max(30, "Tax ID / BRN cannot exceed 30 characters.")
    .regex(NO_HTML_REGEX, "Tax ID contains invalid characters.")
    .optional()
    .nullable()
    .transform((val) => (val ? val.toUpperCase() : null)),
  notes: z
    .string()
    .trim()
    .max(500, "Notes cannot exceed 500 characters.")
    .regex(NO_HTML_REGEX, "Notes contain invalid characters.")
    .optional()
    .nullable(),
  isActive: z.boolean().default(true),
});

export const supplierUpdateSchema = supplierCreateSchema.partial().extend({
  // At least one field should be provided when updating
});

export type SupplierCreateInput = z.infer<typeof supplierCreateSchema>;
export type SupplierUpdateInput = z.infer<typeof supplierUpdateSchema>;
