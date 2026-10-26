/**
 * Prisma seed script — idempotent.
 * Run: npx prisma db seed
 *
 * Creates:
 *  - Roles: admin, manager, viewer
 *  - Permissions for all ERP modules
 *  - Admin user (email + password from .env)
 */
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting database seed...");

  // ── Roles ──────────────────────────────────────────────────────────────────
  const adminRole = await prisma.role.upsert({
    where: { name: "admin" },
    update: {},
    create: { name: "admin", description: "Full system access" },
  });

  const managerRole = await prisma.role.upsert({
    where: { name: "manager" },
    update: {},
    create: { name: "manager", description: "Manage ERP operations" },
  });

  await prisma.role.upsert({
    where: { name: "viewer" },
    update: {},
    create: { name: "viewer", description: "Read-only access" },
  });

  console.log("✅ Roles created");

  // ── Permissions ────────────────────────────────────────────────────────────
  const resources = [
    "dashboard",
    "jobs",
    "suppliers",
    "invoices",
    "approvals",
    "access-control",
    "audit-controller",
    "users",
  ];
  const actions = ["read", "write", "delete"];

  for (const resource of resources) {
    for (const action of actions) {
      await prisma.permission.upsert({
        where: { action_resource: { action, resource } },
        update: {},
        create: { action, resource, description: `${action} ${resource}` },
      });
    }
  }

  console.log("✅ Permissions created");

  // ── Assign all permissions to admin ────────────────────────────────────────
  const allPermissions = await prisma.permission.findMany();
  for (const perm of allPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: adminRole.id, permissionId: perm.id },
      },
      update: {},
      create: { roleId: adminRole.id, permissionId: perm.id },
    });
  }

  // Assign read+write (not delete) to manager
  const managerPerms = allPermissions.filter((p: { action: string }) => p.action !== "delete");
  for (const perm of managerPerms) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: managerRole.id, permissionId: perm.id },
      },
      update: {},
      create: { roleId: managerRole.id, permissionId: perm.id },
    });
  }

  console.log("✅ Role permissions assigned");

  // ── Admin user ─────────────────────────────────────────────────────────────
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@reflecterp.com";
  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD;

  if (!adminPassword) {
    throw new Error(
      "ADMIN_INITIAL_PASSWORD is not set in .env. Cannot seed admin user."
    );
  }

  const passwordHash = await argon2.hash(adminPassword, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      passwordHash,
      isActive: true,
    },
    create: {
      email: adminEmail,
      name: "System Administrator",
      passwordHash,
      isActive: true,
    },
  });

  // Assign admin role
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: adminUser.id, roleId: adminRole.id } },
    update: {},
    create: { userId: adminUser.id, roleId: adminRole.id },
  });

  console.log(`✅ Admin user seeded: ${adminEmail}`);
  console.log("🎉 Seed complete!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
