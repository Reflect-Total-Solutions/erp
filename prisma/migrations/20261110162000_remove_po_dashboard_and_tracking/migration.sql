-- Safe, non-destructive migration to remove PO Dashboard / PO Tracking features
-- while preserving existing Purchase Orders, line items, attachments, and supplier invoices.

-- 1. Preserve any PO records previously marked PARTIALLY_DELIVERED or DELIVERED as active ISSUED POs
UPDATE "purchase_orders"
SET "status" = 'ISSUED'
WHERE "status" IN ('PARTIALLY_DELIVERED', 'DELIVERED');

-- 2. Re-categorize any delivery note attachments to OTHER so no attachment records are lost
UPDATE "purchase_order_attachments"
SET "category" = 'OTHER'
WHERE "category" = 'DELIVERY_NOTE';

-- 3. Remove obsolete PO delivery tracking permission (cascades to role_permissions & user_permissions)
DELETE FROM "permissions"
WHERE "resource" = 'purchaseOrders' AND "action" = 'trackDelivery';

-- 4. Clean obsolete trackDelivery key from cached JSON permission policies if present
UPDATE "users"
SET "permissions" = jsonb_set(
  "permissions"::jsonb,
  '{purchaseOrders}',
  ("permissions"::jsonb -> 'purchaseOrders') - 'trackDelivery'
)
WHERE "permissions" IS NOT NULL
  AND jsonb_typeof("permissions"::jsonb) = 'object'
  AND jsonb_typeof("permissions"::jsonb -> 'purchaseOrders') = 'object'
  AND ("permissions"::jsonb -> 'purchaseOrders') ? 'trackDelivery';

UPDATE "roles"
SET "permissions_data" = jsonb_set(
  "permissions_data"::jsonb,
  '{purchaseOrders}',
  ("permissions_data"::jsonb -> 'purchaseOrders') - 'trackDelivery'
)
WHERE "permissions_data" IS NOT NULL
  AND jsonb_typeof("permissions_data"::jsonb) = 'object'
  AND jsonb_typeof("permissions_data"::jsonb -> 'purchaseOrders') = 'object'
  AND ("permissions_data"::jsonb -> 'purchaseOrders') ? 'trackDelivery';

-- 5. Drop foreign keys referencing removed PO delivery tables
ALTER TABLE "purchase_order_attachments" DROP CONSTRAINT IF EXISTS "purchase_order_attachments_delivery_id_fkey";
ALTER TABLE "purchase_order_delivery_items" DROP CONSTRAINT IF EXISTS "purchase_order_delivery_items_delivery_id_fkey";
ALTER TABLE "purchase_order_delivery_items" DROP CONSTRAINT IF EXISTS "purchase_order_delivery_items_purchase_order_item_id_fkey";
ALTER TABLE "purchase_order_deliveries" DROP CONSTRAINT IF EXISTS "purchase_order_deliveries_created_by_id_fkey";
ALTER TABLE "purchase_order_deliveries" DROP CONSTRAINT IF EXISTS "purchase_order_deliveries_purchase_order_id_fkey";

-- 6. Drop indexes for removed delivery columns
DROP INDEX IF EXISTS "purchase_order_attachments_delivery_id_idx";
DROP INDEX IF EXISTS "purchase_orders_delivery_status_deleted_at_idx";

-- 7. Drop removed delivery tracking columns
ALTER TABLE "purchase_order_attachments" DROP COLUMN IF EXISTS "delivery_id";
ALTER TABLE "purchase_order_items"
  DROP COLUMN IF EXISTS "delivered_quantity",
  DROP COLUMN IF EXISTS "remaining_quantity";
ALTER TABLE "purchase_orders" DROP COLUMN IF EXISTS "delivery_status";

-- 8. Drop removed PO delivery tracking tables
DROP TABLE IF EXISTS "purchase_order_delivery_items";
DROP TABLE IF EXISTS "purchase_order_deliveries";
