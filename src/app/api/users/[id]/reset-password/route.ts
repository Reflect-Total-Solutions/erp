import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { generateSecurePassword } from "@/lib/email";
import { logAuditEvent } from "@/lib/audit";
import { checkSessionPermission } from "@/lib/permissions";
import { resetPasswordSchema } from "@/lib/validations/user";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/users/[id]/reset-password
// Generates or assigns a temporary password, hashes with Argon2id, and sets mustChangePassword: true.
export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized access. Please log in." },
      { status: 401 }
    );
  }

  const isAuthorized = await checkSessionPermission(session, "accessControl", "edit");
  if (!isAuthorized) {
    return NextResponse.json(
      { error: "Forbidden: Administrator privilege required to reset user passwords." },
      { status: 403 }
    );
  }

  const { id } = await params;

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // Body is optional; if empty, a random password is generated automatically
    body = {};
  }

  const validation = resetPasswordSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: validation.error.issues[0]?.message || "Invalid password parameters." },
      { status: 422 }
    );
  }

  const plainPassword = validation.data.newPassword || generateSecurePassword(12);

  try {
    const passwordHash = await hashPassword(plainPassword);

    const result = await prisma.$transaction(async (tx) => {
      let user = await tx.user.findUnique({
        where: { id },
      });

      if (!user) {
        user = await tx.user.findFirst({
          where: {
            OR: [
              { email: { equals: id, mode: "insensitive" } },
              { name: { equals: id, mode: "insensitive" } },
            ],
          },
        });
      }

      if (!user) {
        const err = new Error("User account not found.");
        (err as any).code = "NOT_FOUND";
        throw err;
      }

      // Update password hash and force password change on next login
      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          mustChangePassword: true,
        },
      });

      return updatedUser;
    });

    // Record audit log entry
    await logAuditEvent({
      userId: session.userId,
      action: "RESET_USER_PASSWORD",
      resource: "users",
      resourceId: result.id,
      details: {
        targetUser: result.name,
        targetEmail: result.email,
        forcedPasswordChange: true,
      },
      req,
    });

    return NextResponse.json({
      success: true,
      message: `Password for "${result.name}" reset successfully. User must change it upon next login.`,
      temporaryPassword: plainPassword,
      user: {
        id: result.id,
        name: result.name,
        email: result.email,
      },
    });
  } catch (err: any) {
    console.error("Password reset error:", err);
    if (err?.code === "NOT_FOUND" || err?.message?.includes("not found")) {
      return NextResponse.json({ error: "User account not found." }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Failed to reset user password in database." },
      { status: 500 }
    );
  }
}
