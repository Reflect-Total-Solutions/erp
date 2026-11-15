-- Safe, additive migration for Supplier Payment Management, Partial Payments, Due Dates & Notifications
-- Preserves 100% of existing supplier invoices, attachments, jobs, POs, and financial history.

-- 1. AlterTable: supplier_invoices
ALTER TABLE "supplier_invoices"
  ADD COLUMN IF NOT EXISTS "payment_due_date" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "payment_terms" TEXT,
  ADD COLUMN IF NOT EXISTS "credit_period_days" INTEGER,
  ADD COLUMN IF NOT EXISTS "payment_status" TEXT NOT NULL DEFAULT 'UNPAID',
  ADD COLUMN IF NOT EXISTS "paid_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "last_payment_date" TIMESTAMP(3);

-- Safe backfill for existing supplier invoices without overwriting user data
UPDATE "supplier_invoices"
SET
  "payment_due_date" = COALESCE("payment_due_date", "invoice_date"),
  "paid_amount" = COALESCE("paid_amount", 0),
  "payment_status" = CASE
    WHEN "status" = 'CANCELLED' THEN 'CANCELLED'
    ELSE COALESCE(NULLIF("payment_status", ''), 'UNPAID')
  END
WHERE "payment_due_date" IS NULL
   OR ("status" = 'CANCELLED' AND "payment_status" <> 'CANCELLED');

CREATE INDEX IF NOT EXISTS "supplier_invoices_payment_due_date_deleted_at_idx"
  ON "supplier_invoices"("payment_due_date", "deleted_at");

CREATE INDEX IF NOT EXISTS "supplier_invoices_payment_status_deleted_at_idx"
  ON "supplier_invoices"("payment_status", "deleted_at");

-- 2. CreateTable: supplier_payments
CREATE TABLE IF NOT EXISTS "supplier_payments" (
  "id" TEXT NOT NULL,
  "payment_number" TEXT NOT NULL,
  "supplier_invoice_id" TEXT NOT NULL,
  "supplier_id" TEXT NOT NULL,
  "job_id" TEXT NOT NULL,
  "payment_date" TIMESTAMP(3) NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "payment_method" TEXT NOT NULL,
  "reference_number" TEXT,
  "bank_account_name" TEXT,
  "notes" TEXT,
  "attachment_name" TEXT,
  "attachment_original_name" TEXT,
  "attachment_bucket" TEXT DEFAULT 'supplier-payments',
  "attachment_storage_path" TEXT,
  "attachment_size" TEXT,
  "attachment_mime_type" TEXT,
  "idempotency_key" TEXT,
  "status" TEXT NOT NULL DEFAULT 'SUCCESS',
  "created_by_id" TEXT,
  "updated_by_id" TEXT,
  "reversed_at" TIMESTAMP(3),
  "reversed_by_id" TEXT,
  "reversal_reason" TEXT,
  "correction_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "supplier_payments_payment_number_key"
  ON "supplier_payments"("payment_number");
CREATE UNIQUE INDEX IF NOT EXISTS "supplier_payments_idempotency_key_key"
  ON "supplier_payments"("idempotency_key");
CREATE INDEX IF NOT EXISTS "supplier_payments_supplier_invoice_id_status_idx"
  ON "supplier_payments"("supplier_invoice_id", "status");
CREATE INDEX IF NOT EXISTS "supplier_payments_supplier_id_payment_date_idx"
  ON "supplier_payments"("supplier_id", "payment_date");
CREATE INDEX IF NOT EXISTS "supplier_payments_job_id_idx"
  ON "supplier_payments"("job_id");
CREATE INDEX IF NOT EXISTS "supplier_payments_payment_date_idx"
  ON "supplier_payments"("payment_date");
CREATE INDEX IF NOT EXISTS "supplier_payments_status_idx"
  ON "supplier_payments"("status");

-- 3. CreateTable: supplier_payment_audit_logs
CREATE TABLE IF NOT EXISTS "supplier_payment_audit_logs" (
  "id" TEXT NOT NULL,
  "payment_id" TEXT,
  "invoice_id" TEXT,
  "user_id" TEXT,
  "action" TEXT NOT NULL,
  "reason" TEXT,
  "previous_data" JSONB,
  "new_data" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "supplier_payment_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "supplier_payment_audit_logs_payment_id_created_at_idx"
  ON "supplier_payment_audit_logs"("payment_id", "created_at");
CREATE INDEX IF NOT EXISTS "supplier_payment_audit_logs_invoice_id_created_at_idx"
  ON "supplier_payment_audit_logs"("invoice_id", "created_at");

-- 4. CreateTable: supplier_payment_settings
CREATE TABLE IF NOT EXISTS "supplier_payment_settings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Colombo',
  "upcoming_reminder_days" JSONB NOT NULL DEFAULT '[7,3,1]'::jsonb,
  "notify_on_due_today" BOOLEAN NOT NULL DEFAULT true,
  "notify_daily_overdue" BOOLEAN NOT NULL DEFAULT true,
  "notify_on_partial_payment" BOOLEAN NOT NULL DEFAULT true,
  "notify_on_full_payment" BOOLEAN NOT NULL DEFAULT true,
  "email_reminders_enabled" BOOLEAN NOT NULL DEFAULT false,
  "updated_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "supplier_payment_settings_pkey" PRIMARY KEY ("id")
);

-- Seed default settings row if absent
INSERT INTO "supplier_payment_settings" ("id")
VALUES ('default')
ON CONFLICT ("id") DO NOTHING;

-- 5. CreateTable: notifications
CREATE TABLE IF NOT EXISTS "notifications" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'SUPPLIER_PAYMENT',
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "link_url" TEXT,
  "supplier_invoice_id" TEXT,
  "supplier_id" TEXT,
  "supplier_payment_id" TEXT,
  "scheduled_date_key" TEXT,
  "dedup_key" TEXT,
  "metadata" JSONB,
  "is_read" BOOLEAN NOT NULL DEFAULT false,
  "read_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "notifications_dedup_key_key"
  ON "notifications"("dedup_key");
CREATE INDEX IF NOT EXISTS "notifications_user_id_is_read_created_at_idx"
  ON "notifications"("user_id", "is_read", "created_at");
CREATE INDEX IF NOT EXISTS "notifications_supplier_invoice_id_type_idx"
  ON "notifications"("supplier_invoice_id", "type");

-- 6. AddForeignKeys safely
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supplier_payments_supplier_invoice_id_fkey') THEN
    ALTER TABLE "supplier_payments"
      ADD CONSTRAINT "supplier_payments_supplier_invoice_id_fkey"
      FOREIGN KEY ("supplier_invoice_id") REFERENCES "supplier_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supplier_payments_supplier_id_fkey') THEN
    ALTER TABLE "supplier_payments"
      ADD CONSTRAINT "supplier_payments_supplier_id_fkey"
      FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supplier_payments_job_id_fkey') THEN
    ALTER TABLE "supplier_payments"
      ADD CONSTRAINT "supplier_payments_job_id_fkey"
      FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supplier_payments_created_by_id_fkey') THEN
    ALTER TABLE "supplier_payments"
      ADD CONSTRAINT "supplier_payments_created_by_id_fkey"
      FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supplier_payments_updated_by_id_fkey') THEN
    ALTER TABLE "supplier_payments"
      ADD CONSTRAINT "supplier_payments_updated_by_id_fkey"
      FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supplier_payments_reversed_by_id_fkey') THEN
    ALTER TABLE "supplier_payments"
      ADD CONSTRAINT "supplier_payments_reversed_by_id_fkey"
      FOREIGN KEY ("reversed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supplier_payment_audit_logs_payment_id_fkey') THEN
    ALTER TABLE "supplier_payment_audit_logs"
      ADD CONSTRAINT "supplier_payment_audit_logs_payment_id_fkey"
      FOREIGN KEY ("payment_id") REFERENCES "supplier_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supplier_payment_audit_logs_invoice_id_fkey') THEN
    ALTER TABLE "supplier_payment_audit_logs"
      ADD CONSTRAINT "supplier_payment_audit_logs_invoice_id_fkey"
      FOREIGN KEY ("invoice_id") REFERENCES "supplier_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supplier_payment_audit_logs_user_id_fkey') THEN
    ALTER TABLE "supplier_payment_audit_logs"
      ADD CONSTRAINT "supplier_payment_audit_logs_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supplier_payment_settings_updated_by_id_fkey') THEN
    ALTER TABLE "supplier_payment_settings"
      ADD CONSTRAINT "supplier_payment_settings_updated_by_id_fkey"
      FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_user_id_fkey') THEN
    ALTER TABLE "notifications"
      ADD CONSTRAINT "notifications_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_supplier_invoice_id_fkey') THEN
    ALTER TABLE "notifications"
      ADD CONSTRAINT "notifications_supplier_invoice_id_fkey"
      FOREIGN KEY ("supplier_invoice_id") REFERENCES "supplier_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_supplier_id_fkey') THEN
    ALTER TABLE "notifications"
      ADD CONSTRAINT "notifications_supplier_id_fkey"
      FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_supplier_payment_id_fkey') THEN
    ALTER TABLE "notifications"
      ADD CONSTRAINT "notifications_supplier_payment_id_fkey"
      FOREIGN KEY ("supplier_payment_id") REFERENCES "supplier_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
