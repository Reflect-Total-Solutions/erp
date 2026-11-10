/**
 * Prisma seed script — idempotent.
 * Run: npx prisma db seed
 *
 * Seeds:
 *  - Roles: admin, supervisor, employee
 *  - Granular permissions for all 7 modules + customer billing
 *  - Default role permission policies
 *  - Admin user (email + password from .env)
 */
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import {
  PERMISSION_MODULES,
  DEFAULT_ROLE_PERMISSIONS,
} from "../src/lib/permissions";
import { ensureDefaultDepartments, getOrCreatePoSettings } from "../src/lib/po-number";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting idempotent database seed...");

  // 1. Core ERP Roles
  const adminRole = await prisma.role.upsert({
    where: { name: "admin" },
    update: {
      description: "Full system administration and user management",
      permissionsData: DEFAULT_ROLE_PERMISSIONS.admin as any,
    },
    create: {
      name: "admin",
      description: "Full system administration and user management",
      permissionsData: DEFAULT_ROLE_PERMISSIONS.admin as any,
    },
  });

  const supervisorRole = await prisma.role.upsert({
    where: { name: "supervisor" },
    update: {
      description: "Operations supervision, job review, and invoice processing",
      permissionsData: DEFAULT_ROLE_PERMISSIONS.supervisor as any,
    },
    create: {
      name: "supervisor",
      description: "Operations supervision, job review, and invoice processing",
      permissionsData: DEFAULT_ROLE_PERMISSIONS.supervisor as any,
    },
  });

  const employeeRole = await prisma.role.upsert({
    where: { name: "employee" },
    update: {
      description: "Standard operational access for project quotations and records",
      permissionsData: DEFAULT_ROLE_PERMISSIONS.employee as any,
    },
    create: {
      name: "employee",
      description: "Standard operational access for project quotations and records",
      permissionsData: DEFAULT_ROLE_PERMISSIONS.employee as any,
    },
  });

  console.log("✅ Roles created/updated (admin, supervisor, employee)");

  // 2. Granular Permissions across all modules
  const permissionMap: Record<string, any> = {};
  for (const mod of PERMISSION_MODULES) {
    for (const act of mod.actions) {
      const permKey = `${mod.key}:${act.key}`;
      const permRecord = await prisma.permission.upsert({
        where: {
          action_resource: {
            action: act.key,
            resource: mod.key,
          },
        },
        update: {
          description: act.description,
        },
        create: {
          resource: mod.key,
          action: act.key,
          description: act.description,
        },
      });
      permissionMap[permKey] = permRecord;
    }
  }
  console.log("✅ Granular module permissions seeded");

  // 3. Seed Role Permissions
  const roleMap: Record<string, any> = {
    admin: adminRole,
    supervisor: supervisorRole,
    employee: employeeRole,
  };

  for (const [roleName, policy] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    const roleRecord = roleMap[roleName];
    if (!roleRecord) continue;

    for (const [modKey, actions] of Object.entries(policy)) {
      for (const [actKey, isAllowed] of Object.entries(actions || {})) {
        const permRecord = permissionMap[`${modKey}:${actKey}`];
        if (!permRecord) continue;

        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: roleRecord.id,
              permissionId: permRecord.id,
            },
          },
          update: {
            isAllowed: Boolean(isAllowed),
          },
          create: {
            roleId: roleRecord.id,
            permissionId: permRecord.id,
            isAllowed: Boolean(isAllowed),
          },
        });
      }
    }
  }
  console.log("✅ Role permissions matrix populated");

  // 4. Default Admin User
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@reflecterp.com";
  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD ?? "Admin@12345!";

  const passwordHash = await argon2.hash(adminPassword, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      name: "System Administrator",
      isActive: true,
      deletedAt: null,
    },
    create: {
      email: adminEmail,
      name: "System Administrator",
      passwordHash,
      isActive: true,
    },
  });

  // Assign admin role to user
  await prisma.userRole.upsert({
    where: {
      userId_roleId: { userId: adminUser.id, roleId: adminRole.id },
    },
    update: {},
    create: { userId: adminUser.id, roleId: adminRole.id },
  });

  console.log(`✅ Admin user seeded: ${adminEmail}`);

  // 5. Default PO Settings & Departments
  await getOrCreatePoSettings(prisma);
  await ensureDefaultDepartments(prisma);
  console.log("✅ Purchase Order default settings and departments seeded");

  console.log("🎉 Seed finished successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
