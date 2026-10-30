import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, hashPassword } from "@/lib/password";
import { createSessionToken, setSessionCookie } from "@/lib/auth";
import { checkRateLimit, LOGIN_RATE_LIMIT } from "@/lib/rate-limit";
import { changePasswordSchema } from "@/lib/validations/user";

export async function POST(req: NextRequest) {
  // ── Rate limiting ──────────────────────────────────────────────────────────
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  const rateLimit = checkRateLimit(`pwd-change:${ip}`, LOGIN_RATE_LIMIT);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "Too many password change attempts. Please wait 15 minutes before trying again.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000)
          ),
        },
      }
    );
  }

  // ── Parse & Validate body ─────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
  }

  const parseResult = changePasswordSchema.safeParse(body);
  if (!parseResult.success) {
    const errorMsg = parseResult.error.issues[0]?.message || "Invalid input data.";
    return NextResponse.json({ error: errorMsg }, { status: 422 });
  }

  const { email, currentPassword, newPassword } = parseResult.data;

  // Validate that new password is not identical to current/temporary password
  if (currentPassword === newPassword) {
    return NextResponse.json(
      { error: "New password cannot be the same as your temporary password." },
      { status: 400 }
    );
  }

  const userAgent = req.headers.get("user-agent") ?? undefined;
  const normalizedEmail = email.trim().toLowerCase();

  try {
    // ── Look up user ─────────────────────────────────────────────────────────
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        roles: {
          include: { role: true },
        },
      },
    });

    if (!user || !user.isActive) {
      return NextResponse.json(
        { error: "User account not found or is deactivated." },
        { status: 404 }
      );
    }

    // Verify current temporary password
    const passwordValid = await verifyPassword(user.passwordHash, currentPassword);
    if (!passwordValid) {
      return NextResponse.json(
        { error: "Current temporary password is incorrect." },
        { status: 401 }
      );
    }

    // Hash new password using Argon2id
    const newPasswordHash = await hashPassword(newPassword);

    // Update user: set permanent password and mark password change as completed
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newPasswordHash,
        mustChangePassword: false,
        lastLoginAt: new Date(),
      },
    });

    const roles = user.roles.map((ur: { role: { name: string } }) => ur.role.name);

    // Create session token and cookie
    const { token, expiresAt } = await createSessionToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      roles,
    });

    await setSessionCookie(token);

    // Record audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "PASSWORD_CHANGED",
        resource: "auth",
        ipAddress: ip,
        userAgent,
        details: { reason: "MANDATORY_PASSWORD_RESET_COMPLETED" },
      },
    });

    return NextResponse.json({
      ok: true,
      message: "Password updated successfully. Logging in...",
      user: { id: user.id, email: user.email, name: user.name, roles },
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err) {
    console.error("Change password error:", err);

    return NextResponse.json(
      { error: "Failed to update password in database. Please try again." },
      { status: 500 }
    );
  }
}
