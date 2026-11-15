-- Safe, additive migration for Job Additional Expenses & Audit Trail
-- Preserves 100% of existing Jobs, Cost Items, Supplier Invoices, Supplier Payments, and Profit & Loss records.

-- CreateTable: job_additional_expenses
CREATE TABLE IF NOT EXISTS "job_additional_expenses" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "expense_date" TIMESTAMP(3) NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "supplier_id" TEXT,
    "payee_name" TEXT,
    "payment_reference" TEXT,
    "linked_supplier_invoice_id" TEXT,
    "attachment_name" TEXT,
    "attachment_original_name" TEXT,
    "attachment_bucket" TEXT DEFAULT 'job-additional-expenses',
    "attachment_storage_path" TEXT,
    "attachment_size" TEXT,
    "attachment_mime_type" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "cancellation_reason" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_id" TEXT,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_additional_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable: job_additional_expense_audit_logs
CREATE TABLE IF NOT EXISTS "job_additional_expense_audit_logs" (
    "id" TEXT NOT NULL,
    "expense_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "previous_data" JSONB,
    "new_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_additional_expense_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "job_additional_expenses_job_id_status_idx" ON "job_additional_expenses"("job_id", "status");
CREATE INDEX IF NOT EXISTS "job_additional_expenses_expense_date_idx" ON "job_additional_expenses"("expense_date");
CREATE INDEX IF NOT EXISTS "job_additional_expenses_supplier_id_idx" ON "job_additional_expenses"("supplier_id");
CREATE INDEX IF NOT EXISTS "job_additional_expenses_linked_supplier_invoice_id_idx" ON "job_additional_expenses"("linked_supplier_invoice_id");
CREATE INDEX IF NOT EXISTS "job_additional_expense_audit_logs_expense_id_created_at_idx" ON "job_additional_expense_audit_logs"("expense_id", "created_at");
CREATE INDEX IF NOT EXISTS "job_additional_expense_audit_logs_job_id_created_at_idx" ON "job_additional_expense_audit_logs"("job_id", "created_at");

-- AddForeignKeys safely
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_additional_expenses_job_id_fkey') THEN
    ALTER TABLE "job_additional_expenses" ADD CONSTRAINT "job_additional_expenses_job_id_fkey"
      FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_additional_expenses_supplier_id_fkey') THEN
    ALTER TABLE "job_additional_expenses" ADD CONSTRAINT "job_additional_expenses_supplier_id_fkey"
      FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_additional_expenses_linked_supplier_invoice_id_fkey') THEN
    ALTER TABLE "job_additional_expenses" ADD CONSTRAINT "job_additional_expenses_linked_supplier_invoice_id_fkey"
      FOREIGN KEY ("linked_supplier_invoice_id") REFERENCES "supplier_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_additional_expenses_created_by_id_fkey') THEN
    ALTER TABLE "job_additional_expenses" ADD CONSTRAINT "job_additional_expenses_created_by_id_fkey"
      FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_additional_expenses_updated_by_id_fkey') THEN
    ALTER TABLE "job_additional_expenses" ADD CONSTRAINT "job_additional_expenses_updated_by_id_fkey"
      FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_additional_expenses_cancelled_by_id_fkey') THEN
    ALTER TABLE "job_additional_expenses" ADD CONSTRAINT "job_additional_expenses_cancelled_by_id_fkey"
      FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_additional_expense_audit_logs_expense_id_fkey') THEN
    ALTER TABLE "job_additional_expense_audit_logs" ADD CONSTRAINT "job_additional_expense_audit_logs_expense_id_fkey"
      FOREIGN KEY ("expense_id") REFERENCES "job_additional_expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_additional_expense_audit_logs_user_id_fkey') THEN
    ALTER TABLE "job_additional_expense_audit_logs" ADD CONSTRAINT "job_additional_expense_audit_logs_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
