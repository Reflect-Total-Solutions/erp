-- Safe, additive migration to link Supplier Invoice items to Job Excel Cost Lines
-- while preserving 100% of existing supplier invoices, items, and attachments.

-- AlterTable: supplier_invoice_items
ALTER TABLE "supplier_invoice_items"
  ADD COLUMN IF NOT EXISTS "budget_override_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "is_additional_item" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "job_cost_category_id" TEXT,
  ADD COLUMN IF NOT EXISTS "job_cost_category_name" TEXT,
  ADD COLUMN IF NOT EXISTS "job_cost_item_id" TEXT,
  ADD COLUMN IF NOT EXISTS "original_job_amount" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "unit" TEXT,
  ADD COLUMN IF NOT EXISTS "unit_rate" DECIMAL(18,2);

-- AlterTable: supplier_invoices
ALTER TABLE "supplier_invoices"
  ADD COLUMN IF NOT EXISTS "budget_override_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "budget_override_used" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "supplier_invoice_items_job_cost_item_id_idx"
  ON "supplier_invoice_items"("job_cost_item_id");

CREATE UNIQUE INDEX IF NOT EXISTS "supplier_invoice_items_invoice_id_job_cost_item_id_key"
  ON "supplier_invoice_items"("invoice_id", "job_cost_item_id");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'supplier_invoice_items_job_cost_item_id_fkey'
  ) THEN
    ALTER TABLE "supplier_invoice_items"
      ADD CONSTRAINT "supplier_invoice_items_job_cost_item_id_fkey"
      FOREIGN KEY ("job_cost_item_id") REFERENCES "job_cost_items"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
