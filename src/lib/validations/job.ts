import { z } from "zod";

export const jobStatusEnum = z.enum(["Active", "Pending", "Completed", "In Review"]);

export const jobDocumentSchema = z.object({
  fileName: z.string().min(1, "File name is required"),
  customName: z.string().optional(),
  fileDate: z.string().optional(),
  fileSize: z.string().optional().default("100 KB"),
  fileType: z.string().optional(),
  fileUrl: z.string().url("Valid Supabase file URL is required"),
  storagePath: z.string().optional(),
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
  description: z.string().max(1000).trim().optional().nullable(),
  remarks: z.string().max(1000).trim().optional().nullable(),
  status: jobStatusEnum.optional().default("Active"),
  supplierIds: z.array(z.string()).optional().default([]),
  documents: z.array(jobDocumentSchema).optional().default([]),
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
  description: z.string().max(1000).trim().optional().nullable(),
  remarks: z.string().max(1000).trim().optional().nullable(),
  status: jobStatusEnum.optional(),
  supplierIds: z.array(z.string()).optional(),
});

export type JobCreateInput = z.infer<typeof jobCreateSchema>;
export type JobUpdateInput = z.infer<typeof jobUpdateSchema>;
