import { z } from "zod";

export const jobStatusEnum = z.enum([
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "INVOICE_GENERATED",
  "Pending Approval",
  "Approved",
  "Rejected",
  "Invoice Generated",
  "Invoice Issued",
  "Active",
  "Pending",
  "Completed",
  "In Review",
]);

export const jobCostItemSchema = z.object({
  id: z.string().optional(),
  categoryId: z.string().optional().nullable(),
  itemNumber: z.number().optional().nullable(),
  description: z.string().min(1, "Description is required"),
  rcNrc: z.enum(["RC", "NRC"]).optional().nullable(),
  quantity: z.coerce.number().default(1),
  rate: z.coerce.number().default(0),
  totalCost: z.coerce.number().default(0),
  sortOrder: z.number().default(0),
  notes: z.string().optional().nullable(),
});

export const jobCostCategorySchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Category name is required"),
  sortOrder: z.number().default(0),
  subtotal: z.coerce.number().default(0),
  items: z.array(jobCostItemSchema).optional().default([]),
});

export const jobCostSummarySchema = z.object({
  productionCost: z.coerce.number().default(0),
  runningCost: z.coerce.number().default(0),
  agencyOperationFee: z.coerce.number().default(0),
  agencyProductionFee: z.coerce.number().default(0),
  adminCharges: z.coerce.number().default(0),
  monitoringCost: z.coerce.number().default(0),
  artworkCharges: z.coerce.number().default(0),
  contingencies: z.coerce.number().default(0),
  subTotal: z.coerce.number().default(0),
  totalBeforeTax: z.coerce.number().default(0),
  taxType: z.string().optional().default("SSCL"),
  taxRate: z.coerce.number().optional().default(2.5),
  taxAmount: z.coerce.number().default(0),
  grandTotal: z.coerce.number().default(0),
  rawSummaryData: z.record(z.string(), z.any()).optional().nullable(),
});

export const jobDocumentSchema = z.object({
  fileName: z.string().min(1, "File name is required"),
  customName: z.string().optional(),
  fileDate: z.string().optional(),
  fileSize: z.string().optional().default("100 KB"),
  fileType: z.string().optional(),
  fileUrl: z.string().url("Valid Supabase file URL is required"),
  storagePath: z.string().optional(),
  fileHash: z.string().optional(),
  status: z.enum(["Processed", "Uploaded", "Analyzing"]).optional().default("Processed"),
});

export const jobCreateSchema = z.object({
  name: z
    .string()
    .min(2, "Job name must be at least 2 characters")
    .max(200, "Job name cannot exceed 200 characters")
    .trim(),
  jobCode: z
    .string()
    .trim()
    .transform((v) => (v ? v.toUpperCase() : undefined))
    .optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional(),
  commencingDate: z.string().optional().nullable(),
  clientName: z.string().max(200).trim().optional().nullable(),
  handledBy: z.string().max(100).trim().optional().nullable(),
  description: z.string().max(2000).trim().optional().nullable(),
  remarks: z.string().max(2000).trim().optional().nullable(),
  status: jobStatusEnum.optional().default("PENDING_APPROVAL"),
  supplierIds: z.array(z.string()).optional().default([]),
  fileHash: z.string().optional().nullable(),
  totalCost: z.coerce.number().optional().default(0),
  grandTotal: z.coerce.number().optional().default(0),
  documents: z.array(jobDocumentSchema).optional().default([]),
  costCategories: z.array(jobCostCategorySchema).optional().default([]),
  costItems: z.array(jobCostItemSchema).optional().default([]),
  costSummary: jobCostSummarySchema.optional().nullable(),
});

export const jobUpdateSchema = z.object({
  name: z.string().min(2).max(200).trim().optional(),
  jobCode: z
    .string()
    .trim()
    .transform((v) => (v ? v.toUpperCase() : undefined))
    .optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional(),
  commencingDate: z.string().optional().nullable(),
  clientName: z.string().max(200).trim().optional().nullable(),
  handledBy: z.string().max(100).trim().optional().nullable(),
  description: z.string().max(2000).trim().optional().nullable(),
  remarks: z.string().max(2000).trim().optional().nullable(),
  status: jobStatusEnum.optional(),
  supplierIds: z.array(z.string()).optional(),
  totalCost: z.number().optional(),
  grandTotal: z.number().optional(),
  costCategories: z.array(jobCostCategorySchema).optional(),
  costItems: z.array(jobCostItemSchema).optional(),
  costSummary: jobCostSummarySchema.optional().nullable(),
});

export type JobCreateInput = z.infer<typeof jobCreateSchema>;
export type JobUpdateInput = z.infer<typeof jobUpdateSchema>;
