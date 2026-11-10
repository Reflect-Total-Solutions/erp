import { z } from "zod";

export const departmentSchema = z.object({
  name: z.string().trim().min(2, "Department name is required (min 2 chars)").max(80),
  code: z.string().trim().max(24).optional().nullable(),
  isActive: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

export const poSettingsSchema = z.object({
  companyName: z.string().trim().min(2).max(160),
  companyAddress: z.string().trim().min(2).max(300),
  companyRegNo: z.string().trim().max(80).optional().nullable(),
  companyEmail: z.string().trim().max(120).optional().nullable(),
  companyPhone: z.string().trim().max(60).optional().nullable(),
  defaultDeliverToName: z.string().trim().max(160).optional().nullable(),
  defaultDeliverToAddress: z.string().trim().max(300).optional().nullable(),
  defaultDeliverToEmail: z.string().trim().max(120).optional().nullable(),
  poNumberPrefix: z.string().trim().min(2).max(32),
  financialYearCode: z.string().trim().min(2).max(20),
  poNumberPadding: z.coerce.number().int().min(1).max(6).default(2),
  defaultSsclRate: z.coerce.number().min(0).max(100),
  defaultVatRate: z.coerce.number().min(0).max(100),
  defaultApplySscl: z.boolean(),
  defaultApplyVat: z.boolean(),
  defaultCurrency: z.string().trim().min(2).max(10).default("LKR"),
  defaultComments: z.string().max(1000).optional().nullable(),
  defaultTerms: z.string().max(2000).optional().nullable(),
});

export const poDepartmentAllocationInputSchema = z.object({
  departmentId: z.string().min(1),
  allocatedQuantity: z.coerce.number().min(0).default(0),
  allocatedAmount: z.coerce.number().min(0).default(0),
  percentage: z.coerce.number().min(0).max(100).default(0),
  notes: z.string().max(300).optional().nullable(),
});

export const poItemInputSchema = z.object({
  id: z.string().optional(),
  jobCostCategoryId: z.string().optional().nullable(),
  jobCostCategoryName: z.string().max(160).optional().nullable(),
  jobCostItemId: z.string().optional().nullable(),
  particular: z.string().trim().min(1, "Particular / Item description is required").max(400),
  brand: z.string().trim().max(120).optional().nullable(),
  specifications: z.string().trim().max(500).optional().nullable(),
  quantity: z.coerce.number().positive("Quantity must be greater than 0"),
  measure: z.string().trim().min(1, "Measure unit is required").max(40),
  unitCost: z.coerce.number().min(0, "Unit cost cannot be negative"),
  isAdditionalItem: z.boolean().optional().default(false),
  budgetOverrideReason: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  departmentAllocations: z.array(poDepartmentAllocationInputSchema).optional().default([]),
});

export const poCreateSchema = z.object({
  jobId: z.string().min(1, "Approved Job selection is required"),
  supplierId: z.string().min(1, "Supplier selection is required"),
  poNumber: z.string().trim().max(60).optional().nullable(),
  poDate: z.string().min(1, "PO Date is required"),
  quotationRef: z.string().trim().max(120).optional().nullable(),
  expectedDeliveryDate: z.string().optional().nullable(),
  deliverToName: z.string().trim().min(1, "Deliver To Name is required").max(160),
  deliverToAddress: z.string().trim().min(1, "Deliver To Address is required").max(300),
  deliverToEmail: z.string().trim().max(120).optional().nullable(),
  comments: z.string().max(1500).optional().nullable(),
  terms: z.string().max(2500).optional().nullable(),
  discountAmount: z.coerce.number().min(0).optional().default(0),
  applySscl: z.boolean().optional().default(true),
  ssclRate: z.coerce.number().min(0).max(100).optional().default(2.56),
  applyVat: z.boolean().optional().default(true),
  vatRate: z.coerce.number().min(0).max(100).optional().default(18),
  currency: z.string().trim().min(2).max(10).optional().default("LKR"),
  hasDepartmentAllocation: z.boolean().optional().default(false),
  departmentAllocationMode: z.enum(["AMOUNT", "QUANTITY"]).optional().default("AMOUNT"),
  budgetOverrideReason: z.string().trim().max(800).optional().nullable(),
  submitAction: z.enum(["DRAFT", "SUBMIT"]).optional().default("DRAFT"),
  items: z.array(poItemInputSchema).min(1, "At least one Purchase Order item is required"),
});

export const poApprovalActionSchema = z.object({
  action: z.enum(["SUBMIT", "APPROVE", "REJECT", "ISSUE", "CANCEL", "RETURN_TO_DRAFT"]),
  reason: z.string().trim().max(1000).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const poDeliverySchema = z.object({
  deliveryReference: z.string().trim().min(1, "Delivery Reference is required").max(100),
  deliveryDate: z.string().min(1, "Delivery Date is required"),
  receivedBy: z.string().trim().min(1, "Received By is required").max(120),
  notes: z.string().trim().max(1000).optional().nullable(),
  isOverride: z.boolean().optional().default(false),
  overrideReason: z.string().trim().max(500).optional().nullable(),
  items: z
    .array(
      z.object({
        purchaseOrderItemId: z.string().min(1),
        deliveredQuantity: z.coerce.number().min(0),
        notes: z.string().max(400).optional().nullable(),
      })
    )
    .min(1, "Select at least one item to record delivery"),
});
