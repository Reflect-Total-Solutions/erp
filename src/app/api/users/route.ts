import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { userCreateSchema } from "@/lib/validations/user";
import { generateSecurePassword, sendUserWelcomeEmail } from "@/lib/email";
import { logAuditEvent } from "@/lib/audit";
import { checkSessionPermission } from "@/lib/permissions";

// GET /api/users
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized access. Please log in." },
      { status: 401 }
    );
  }

  const isAuthorized = await checkSessionPermission(session, "accessControl", "view");
  if (!isAuthorized) {
    return NextResponse.json(
      { error: "Forbidden: Administrator privilege required to view user accounts." },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "all";
  const search = searchParams.get("search")?.trim() ?? "";

  try {
    const where: Record<string, unknown> = {};

    if (status === "active") {
      where.deletedAt = null;
    } else if (status === "deactivated") {
      where.deletedAt = { not: null };
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
      ];
    }

    const users = await prisma.user.findMany({
      where,
      include: {
        roles: {
          include: {
            role: true,
          },
        },
        supervisor: {
          select: { id: true, name: true, email: true },
        },
        subordinates: {
          where: { deletedAt: null },
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      data: (users as any[]).map((u) => {
        const rawRole = (u.roles?.[0]?.role?.name || "employee").toLowerCase();
        let roleId = "role-employer";
        if (rawRole === "admin") roleId = "role-admin";
        else if (rawRole === "supervisor") roleId = "role-supervisor";

        const formattedLastLogin = u.lastLoginAt
          ? new Date(u.lastLoginAt).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "Never (Invited)";

        return {
          id: u.id,
          name: u.name,
          email: u.email,
          phone: u.phone || "",
          jobTitle: u.jobTitle || undefined,
          department: u.department || rawRole.toUpperCase(),
          supervisorId: u.supervisorId || null,
          supervisorName: u.supervisor?.name || null,
          subordinatesCount: u.subordinates?.length || 0,
          roleId,
          role: rawRole,
          status: u.deletedAt ? "Suspended" : u.isActive ? "Active" : "Suspended",
          isActive: u.isActive,
          isDeleted: u.deletedAt !== null,
          deletedAt: u.deletedAt ? new Date(u.deletedAt).toISOString() : undefined,
          lastLogin: formattedLastLogin,
          createdAt: u.createdAt ? new Date(u.createdAt).toISOString().split("T")[0] : "",
          permissions: u.permissions || undefined,
          hasCustomPermissions: !!u.permissions && Object.keys(u.permissions).length > 0,
        };
      }),
    });
  } catch (err) {
    console.error("GET /api/users error:", err);
    // Graceful fallback for preview / offline mode
    return NextResponse.json({
      success: false,
      error: "Could not retrieve users from database.",
      fallback: true,
    });
  }
}

// POST /api/users
// Creates a new user in PostgreSQL with Argon2id hashed password and mustChangePassword flag.
// Passwords are NOT sent via email — they are returned securely to the admin on screen.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized access. Please log in." },
      { status: 401 }
    );
  }

  const isAuthorized = await checkSessionPermission(session, "accessControl", "create");
  if (!isAuthorized) {
    return NextResponse.json(
      { error: "Forbidden: Administrator privilege required to create and provision user accounts." },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body." },
      { status: 400 }
    );
  }

  // 1. Validate payload with Zod
  const validationResult = userCreateSchema.safeParse(body);
  if (!validationResult.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of validationResult.error.issues) {
      const field = issue.path[0] ? String(issue.path[0]) : "general";
      fieldErrors[field] = issue.message;
    }
    return NextResponse.json(
      { error: "Validation failed.", fieldErrors },
      { status: 422 }
    );
  }

  const { name, email, phone, role, jobTitle } = validationResult.data;
  const normalizedEmail = email.trim().toLowerCase();

  // 2. Generate a cryptographically secure temporary password
  const temporaryPassword = generateSecurePassword(12);

  try {
    // 3. Hash password with Argon2id
    const passwordHash = await hashPassword(temporaryPassword);

    // 4. Execute atomic database transaction
    const { newUser, dbRole } = await prisma.$transaction(async (tx) => {
      // Check existing email
      const existing = await tx.user.findFirst({
        where: {
          email: { equals: normalizedEmail, mode: "insensitive" },
        },
      });

      if (existing) {
        if (existing.deletedAt === null) {
          const err = new Error(`A user with email "${normalizedEmail}" already exists.`);
          (err as any).code = "DUPLICATE_EMAIL";
          throw err;
        }

        // If user was previously soft-deleted, reactivate and update credentials
        let targetRole = await tx.role.findUnique({
          where: { name: role },
        });
        if (!targetRole) {
          targetRole = await tx.role.create({
            data: {
              name: role,
              description: `${role.toUpperCase()} role access`,
            },
          });
        }

        const reactivated = await tx.user.update({
          where: { id: existing.id },
          data: {
            name,
            phone: phone || null,
            jobTitle: jobTitle || null,
            passwordHash,
            isActive: true,
            mustChangePassword: true,
            lastLoginAt: null,
            deletedAt: null,
          },
        });

        await tx.userRole.deleteMany({ where: { userId: existing.id } });
        await tx.userRole.create({
          data: {
            userId: existing.id,
            roleId: targetRole.id,
          },
        });

        return { newUser: reactivated, dbRole: targetRole };
      }

      // Ensure target role exists in database
      let targetRole = await tx.role.findUnique({
        where: { name: role },
      });

      if (!targetRole) {
        targetRole = await tx.role.create({
          data: {
            name: role,
            description: `${role.toUpperCase()} role access`,
          },
        });
      }

      // Create new user in PostgreSQL
      const createdUser = await tx.user.create({
        data: {
          name,
          email: normalizedEmail,
          phone: phone || null,
          jobTitle: jobTitle || null,
          passwordHash,
          isActive: true,
          mustChangePassword: true,
          lastLoginAt: null,
        },
      });

      // Associate role
      await tx.userRole.create({
        data: {
          userId: createdUser.id,
          roleId: targetRole.id,
        },
      });

      return { newUser: createdUser, dbRole: targetRole };
    });

    // 5. Audit Log (Logged securely, never includes password)
    await logAuditEvent({
      userId: session.userId,
      action: "CREATE_USER",
      resource: "users",
      resourceId: newUser.id,
      details: {
        name: newUser.name,
        email: newUser.email,
        phone,
        role,
        mustChangePassword: true,
      },
      req,
    });

    const roleIdMap: Record<string, string> = {
      admin: "role-admin",
      supervisor: "role-supervisor",
      employee: "role-employer",
    };

    return NextResponse.json(
      {
        success: true,
        message: `User "${newUser.name}" created and saved successfully in database.`,
        user: {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          phone: newUser.phone || "",
          jobTitle: newUser.jobTitle || undefined,
          role,
          roleId: roleIdMap[role] || "role-employer",
          department: role.toUpperCase(),
          status: "Active",
          lastLogin: "Never (Invited)",
          isActive: true,
          isDeleted: false,
          createdAt: new Date().toISOString().split("T")[0],
          persistedInDb: true,
        },
        temporaryPassword,
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("Database user creation failed:", err);

    if (err?.code === "DUPLICATE_EMAIL" || err?.message?.includes("already exists")) {
      return NextResponse.json(
        {
          error: `A user with email "${normalizedEmail}" already exists.`,
          fieldErrors: { email: "This email address is already registered in the system." },
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to create user account in database. " + (err?.message || "Please check database connection."),
      },
      { status: 500 }
    );
  }
}
