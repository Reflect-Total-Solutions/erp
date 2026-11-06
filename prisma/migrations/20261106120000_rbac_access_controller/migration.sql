-- AlterTable
ALTER TABLE "role_permissions" ADD COLUMN IF NOT EXISTS "is_allowed" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE IF NOT EXISTS "user_permissions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,
    "is_allowed" BOOLEAN NOT NULL DEFAULT true,
    "updated_by_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "permission_audit_logs" (
    "id" TEXT NOT NULL,
    "target_user_id" TEXT NOT NULL,
    "permission_id" TEXT,
    "module_key" TEXT NOT NULL,
    "action_key" TEXT NOT NULL,
    "previous_value" BOOLEAN,
    "new_value" BOOLEAN NOT NULL,
    "changed_by_id" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permission_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "user_permissions_user_id_permission_id_key" ON "user_permissions"("user_id", "permission_id");
CREATE INDEX IF NOT EXISTS "user_permissions_user_id_idx" ON "user_permissions"("user_id");
CREATE INDEX IF NOT EXISTS "user_permissions_permission_id_idx" ON "user_permissions"("permission_id");
CREATE INDEX IF NOT EXISTS "permission_audit_logs_target_user_id_created_at_idx" ON "permission_audit_logs"("target_user_id", "created_at");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_permissions_user_id_fkey') THEN
        ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_permissions_permission_id_fkey') THEN
        ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_permissions_updated_by_id_fkey') THEN
        ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'permission_audit_logs_target_user_id_fkey') THEN
        ALTER TABLE "permission_audit_logs" ADD CONSTRAINT "permission_audit_logs_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'permission_audit_logs_changed_by_id_fkey') THEN
        ALTER TABLE "permission_audit_logs" ADD CONSTRAINT "permission_audit_logs_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
