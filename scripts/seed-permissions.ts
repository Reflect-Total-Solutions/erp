import { PrismaClient } from "@prisma/client";
import {
  PERMISSION_MODULES,
  DEFAULT_ROLE_PERMISSIONS,
  ERPModule,
  ERPAction,
} from "../src/lib/permissions";

const prisma = new PrismaClient();

async function main() {
  console.log("🚀 Initializing Database RBAC & Permission System...");

  // 1. Ensure the standard ERP roles exist
  const rolesToEnsure = [
    { name: "admin", description: "Full system administration and user management" },
    { name: "supervisor", description: "Operations supervision, job review, and invoice processing" },
    { name: "employee", description: "Standard operational access for project quotations and records" },
  ];

  const dbRoles: Record<string, any> = {};
  for (const r of rolesToEnsure) {
    const roleRecord = await prisma.role.upsert({
      where: { name: r.name },
      update: {
        description: r.description,
        permissionsData: DEFAULT_ROLE_PERMISSIONS[r.name] as any,
      },
      create: {
        name: r.name,
        description: r.description,
        permissionsData: DEFAULT_ROLE_PERMISSIONS[r.name] as any,
      },
    });
    dbRoles[r.name] = roleRecord;
  }
  console.log("✅ Core roles (admin, supervisor, employee) verified with default policies.");

  // 2. Seed all granular permissions from PERMISSION_MODULES
  let permCount = 0;
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
      permCount++;
    }
  }
  console.log(`✅ Seeded ${permCount} granular module permissions across ${PERMISSION_MODULES.length} modules.`);

  // 4. Seed role_permissions for each role matching DEFAULT_ROLE_PERMISSIONS
  for (const [roleName, policy] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    const roleRecord = dbRoles[roleName];
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
  console.log("✅ Granular role_permissions relational policies synchronized.");

  // 5. Ensure Super Admin account has correct admin role
  const adminEmail = process.env.ADMIN_EMAIL || "admin@reflecterp.com";
  const superAdmin = await prisma.user.findFirst({
    where: { email: { equals: adminEmail, mode: "insensitive" } },
  });

  if (superAdmin) {
    // Ensure linked to admin role
    const adminRole = dbRoles.admin;
    if (adminRole) {
      await prisma.userRole.upsert({
        where: {
          userId_roleId: {
            userId: superAdmin.id,
            roleId: adminRole.id,
          },
        },
        update: {},
        create: {
          userId: superAdmin.id,
          roleId: adminRole.id,
        },
      });
    }
    console.log(`✅ Super Administrator account (${adminEmail}) verified.`);
  }

  console.log("🎉 Access Controller & RBAC system successfully seeded!");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
