-- AlterTable
ALTER TABLE "supplier_invoice_items" ADD COLUMN     "purchase_order_item_id" TEXT,
ADD COLUMN     "quantity" DECIMAL(18,4);

-- AlterTable
ALTER TABLE "supplier_invoices" ADD COLUMN     "purchase_order_id" TEXT;

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "company_name" TEXT NOT NULL DEFAULT 'Reflect Total Solutions (Pvt) Ltd.',
    "company_address" TEXT NOT NULL DEFAULT '13/2, Sri Dharmapala MW, Mount Lavinia, Sri Lanka.',
    "company_reg_no" TEXT DEFAULT 'PV 00215364',
    "company_email" TEXT,
    "company_phone" TEXT,
    "default_deliver_to_name" TEXT DEFAULT 'Reflect Total Solutions (Pvt) Ltd.',
    "default_deliver_to_address" TEXT DEFAULT '13/2, Sri Dharmapala MW, Mount Lavinia.',
    "default_deliver_to_email" TEXT DEFAULT '',
    "po_number_prefix" TEXT NOT NULL DEFAULT 'RTS/PO',
    "financial_year_code" TEXT NOT NULL DEFAULT '26/27',
    "po_number_padding" INTEGER NOT NULL DEFAULT 2,
    "default_sscl_rate" DECIMAL(6,3) NOT NULL DEFAULT 2.56,
    "default_vat_rate" DECIMAL(6,3) NOT NULL DEFAULT 18,
    "default_apply_sscl" BOOLEAN NOT NULL DEFAULT true,
    "default_apply_vat" BOOLEAN NOT NULL DEFAULT true,
    "default_currency" TEXT NOT NULL DEFAULT 'LKR',
    "default_comments" TEXT,
    "default_terms" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_order_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_number_sequences" (
    "id" TEXT NOT NULL,
    "series_key" TEXT NOT NULL,
    "last_sequence" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_order_number_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "po_number" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "po_date" TIMESTAMP(3) NOT NULL,
    "quotation_ref" TEXT,
    "expected_delivery_date" TIMESTAMP(3),
    "deliver_to_name" TEXT NOT NULL,
    "deliver_to_address" TEXT NOT NULL,
    "deliver_to_email" TEXT,
    "supplier_name_snapshot" TEXT,
    "supplier_address_snapshot" TEXT,
    "supplier_email_snapshot" TEXT,
    "supplier_phone_snapshot" TEXT,
    "supplier_contact_snapshot" TEXT,
    "comments" TEXT,
    "terms" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approval_status" TEXT NOT NULL DEFAULT 'DRAFT',
    "delivery_status" TEXT NOT NULL DEFAULT 'NOT_DELIVERED',
    "sub_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_after_discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "apply_sscl" BOOLEAN NOT NULL DEFAULT true,
    "sscl_rate" DECIMAL(6,3) NOT NULL DEFAULT 2.56,
    "sscl_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_with_sscl" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "apply_vat" BOOLEAN NOT NULL DEFAULT true,
    "vat_rate" DECIMAL(6,3) NOT NULL DEFAULT 18,
    "vat_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "grand_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'LKR',
    "has_department_allocation" BOOLEAN NOT NULL DEFAULT false,
    "department_allocation_mode" TEXT DEFAULT 'AMOUNT',
    "budget_override_approved" BOOLEAN NOT NULL DEFAULT false,
    "budget_override_reason" TEXT,
    "submitted_by_id" TEXT,
    "submitted_at" TIMESTAMP(3),
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejected_by_id" TEXT,
    "rejected_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "issued_by_id" TEXT,
    "issued_at" TIMESTAMP(3),
    "cancelled_by_id" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancellation_reason" TEXT,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_items" (
    "id" TEXT NOT NULL,
    "purchase_order_id" TEXT NOT NULL,
    "row_number" INTEGER NOT NULL DEFAULT 1,
    "job_cost_category_id" TEXT,
    "job_cost_category_name" TEXT,
    "job_cost_item_id" TEXT,
    "particular" TEXT NOT NULL,
    "brand" TEXT,
    "specifications" TEXT,
    "quantity" DECIMAL(18,4) NOT NULL DEFAULT 1,
    "measure" TEXT NOT NULL DEFAULT 'Nos',
    "unit_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "delivered_quantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "remaining_quantity" DECIMAL(18,4) NOT NULL DEFAULT 1,
    "invoiced_quantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "invoiced_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "is_additional_item" BOOLEAN NOT NULL DEFAULT false,
    "budget_override_reason" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_department_allocations" (
    "id" TEXT NOT NULL,
    "purchase_order_id" TEXT NOT NULL,
    "purchase_order_item_id" TEXT,
    "department_id" TEXT NOT NULL,
    "allocated_quantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "allocated_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "percentage" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_order_department_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_deliveries" (
    "id" TEXT NOT NULL,
    "purchase_order_id" TEXT NOT NULL,
    "delivery_reference" TEXT NOT NULL,
    "delivery_date" TIMESTAMP(3) NOT NULL,
    "received_by" TEXT NOT NULL,
    "notes" TEXT,
    "is_override" BOOLEAN NOT NULL DEFAULT false,
    "override_reason" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_order_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_delivery_items" (
    "id" TEXT NOT NULL,
    "delivery_id" TEXT NOT NULL,
    "purchase_order_item_id" TEXT NOT NULL,
    "delivered_quantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "purchase_order_delivery_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_attachments" (
    "id" TEXT NOT NULL,
    "purchase_order_id" TEXT NOT NULL,
    "delivery_id" TEXT,
    "category" TEXT NOT NULL DEFAULT 'PO_DOCUMENT',
    "file_name" TEXT NOT NULL,
    "original_file_name" TEXT,
    "stored_file_name" TEXT,
    "bucket_name" TEXT DEFAULT 'purchase-orders',
    "storage_path" TEXT,
    "file_size" TEXT NOT NULL,
    "file_type" TEXT DEFAULT 'application/pdf',
    "mime_type" TEXT,
    "file_url" TEXT NOT NULL,
    "uploaded_by_id" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_order_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_approval_histories" (
    "id" TEXT NOT NULL,
    "purchase_order_id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "previous_status" TEXT NOT NULL,
    "new_status" TEXT NOT NULL,
    "reason" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_order_approval_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_audit_logs" (
    "id" TEXT NOT NULL,
    "purchase_order_id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "previous_data" JSONB,
    "new_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_order_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- CreateIndex
CREATE INDEX "departments_is_active_sort_order_idx" ON "departments"("is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_number_sequences_series_key_key" ON "purchase_order_number_sequences"("series_key");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_po_number_key" ON "purchase_orders"("po_number");

-- CreateIndex
CREATE INDEX "purchase_orders_job_id_deleted_at_idx" ON "purchase_orders"("job_id", "deleted_at");

-- CreateIndex
CREATE INDEX "purchase_orders_supplier_id_deleted_at_idx" ON "purchase_orders"("supplier_id", "deleted_at");

-- CreateIndex
CREATE INDEX "purchase_orders_status_deleted_at_idx" ON "purchase_orders"("status", "deleted_at");

-- CreateIndex
CREATE INDEX "purchase_orders_approval_status_deleted_at_idx" ON "purchase_orders"("approval_status", "deleted_at");

-- CreateIndex
CREATE INDEX "purchase_orders_delivery_status_deleted_at_idx" ON "purchase_orders"("delivery_status", "deleted_at");

-- CreateIndex
CREATE INDEX "purchase_orders_created_by_id_deleted_at_idx" ON "purchase_orders"("created_by_id", "deleted_at");

-- CreateIndex
CREATE INDEX "purchase_orders_po_date_idx" ON "purchase_orders"("po_date");

-- CreateIndex
CREATE INDEX "purchase_order_items_purchase_order_id_row_number_idx" ON "purchase_order_items"("purchase_order_id", "row_number");

-- CreateIndex
CREATE INDEX "purchase_order_items_job_cost_item_id_idx" ON "purchase_order_items"("job_cost_item_id");

-- CreateIndex
CREATE INDEX "purchase_order_department_allocations_purchase_order_id_idx" ON "purchase_order_department_allocations"("purchase_order_id");

-- CreateIndex
CREATE INDEX "purchase_order_department_allocations_purchase_order_item_i_idx" ON "purchase_order_department_allocations"("purchase_order_item_id");

-- CreateIndex
CREATE INDEX "purchase_order_department_allocations_department_id_idx" ON "purchase_order_department_allocations"("department_id");

-- CreateIndex
CREATE INDEX "purchase_order_deliveries_purchase_order_id_delivery_date_idx" ON "purchase_order_deliveries"("purchase_order_id", "delivery_date");

-- CreateIndex
CREATE INDEX "purchase_order_delivery_items_delivery_id_idx" ON "purchase_order_delivery_items"("delivery_id");

-- CreateIndex
CREATE INDEX "purchase_order_delivery_items_purchase_order_item_id_idx" ON "purchase_order_delivery_items"("purchase_order_item_id");

-- CreateIndex
CREATE INDEX "purchase_order_attachments_purchase_order_id_deleted_at_idx" ON "purchase_order_attachments"("purchase_order_id", "deleted_at");

-- CreateIndex
CREATE INDEX "purchase_order_attachments_delivery_id_idx" ON "purchase_order_attachments"("delivery_id");

-- CreateIndex
CREATE INDEX "purchase_order_approval_histories_purchase_order_id_created_idx" ON "purchase_order_approval_histories"("purchase_order_id", "created_at");

-- CreateIndex
CREATE INDEX "purchase_order_audit_logs_purchase_order_id_created_at_idx" ON "purchase_order_audit_logs"("purchase_order_id", "created_at");

-- CreateIndex
CREATE INDEX "supplier_invoice_items_purchase_order_item_id_idx" ON "supplier_invoice_items"("purchase_order_item_id");

-- CreateIndex
CREATE INDEX "supplier_invoices_purchase_order_id_idx" ON "supplier_invoices"("purchase_order_id");

-- AddForeignKey
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoice_items" ADD CONSTRAINT "supplier_invoice_items_purchase_order_item_id_fkey" FOREIGN KEY ("purchase_order_item_id") REFERENCES "purchase_order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_settings" ADD CONSTRAINT "purchase_order_settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_rejected_by_id_fkey" FOREIGN KEY ("rejected_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_issued_by_id_fkey" FOREIGN KEY ("issued_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_job_cost_item_id_fkey" FOREIGN KEY ("job_cost_item_id") REFERENCES "job_cost_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_department_allocations" ADD CONSTRAINT "purchase_order_department_allocations_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_department_allocations" ADD CONSTRAINT "purchase_order_department_allocations_purchase_order_item__fkey" FOREIGN KEY ("purchase_order_item_id") REFERENCES "purchase_order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_department_allocations" ADD CONSTRAINT "purchase_order_department_allocations_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_deliveries" ADD CONSTRAINT "purchase_order_deliveries_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_deliveries" ADD CONSTRAINT "purchase_order_deliveries_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_delivery_items" ADD CONSTRAINT "purchase_order_delivery_items_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "purchase_order_deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_delivery_items" ADD CONSTRAINT "purchase_order_delivery_items_purchase_order_item_id_fkey" FOREIGN KEY ("purchase_order_item_id") REFERENCES "purchase_order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_attachments" ADD CONSTRAINT "purchase_order_attachments_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_attachments" ADD CONSTRAINT "purchase_order_attachments_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "purchase_order_deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_attachments" ADD CONSTRAINT "purchase_order_attachments_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_approval_histories" ADD CONSTRAINT "purchase_order_approval_histories_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_approval_histories" ADD CONSTRAINT "purchase_order_approval_histories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_audit_logs" ADD CONSTRAINT "purchase_order_audit_logs_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_audit_logs" ADD CONSTRAINT "purchase_order_audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
