import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import {
  SESSION_COOKIE,
  createSessionToken,
  getSessionCookieOptions,
} from "@/lib/auth";
import {
  LOGIN_RATE_LIMIT,
  clearRateLimit,
  isRateLimited,
  recordRateLimitHit,
} from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";

    // ── Parse body ───────────────────────────────────────────────────────────
    let body: { email?: string; password?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { email, password } = body;

    if (!email || typeof email !== "string" || !password || typeof password !== "string") {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const userAgent = req.headers.get("user-agent") ?? undefined;
    const normalizedEmail = email.trim().toLowerCase();
    const rateLimitKey = `login:${ip}:${normalizedEmail}`;

    // ── Rate limiting (failed attempts only, scoped per IP + email) ─────────
    const rateLimit = isRateLimited(rateLimitKey, LOGIN_RATE_LIMIT);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error:
            "Too many failed login attempts. Please wait 15 minutes before trying again.",
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

    // ── Look up user ─────────────────────────────────────────────────────────
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        roles: {
          include: { role: true },
        },
      },
    });

    const isEligibleUser = user !== null && user.isActive && user.deletedAt === null;

    // Constant-time comparison to prevent timing attacks
    const passwordValid = isEligibleUser
      ? await verifyPassword(user.passwordHash, password)
      : false;

    // Log attempt (always, whether successful or not)
    await prisma.loginAttempt.create({
      data: {
        userId: user?.id ?? null,
        email: normalizedEmail,
        ipAddress: ip,
        userAgent,
        success: isEligibleUser && passwordValid,
      },
    });

    // Generic error message to avoid user enumeration
    if (!isEligibleUser || !passwordValid) {
      recordRateLimitHit(rateLimitKey, LOGIN_RATE_LIMIT);
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    clearRateLimit(rateLimitKey);

    const roles = user.roles.map((ur: { role: { name: string } }) => ur.role.name);

    // ── First-time login / Temporary password check ───────────────────────────
    // If the user has never completed a login (lastLoginAt is null) or mustChangePassword flag is set:
    const isFirstLogin = user.lastLoginAt === null || user.mustChangePassword === true;

    if (isFirstLogin) {
      return NextResponse.json({
        ok: true,
        mustChangePassword: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          roles,
        },
        message: "Temporary password detected. Please set a new permanent password to continue.",
      });
    }

    // ── Create session ───────────────────────────────────────────────────────
    const { token, expiresAt } = await createSessionToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      roles,
    });

    // Update last login timestamp
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "LOGIN",
        resource: "auth",
        ipAddress: ip,
        userAgent,
        details: { roles },
      },
    });

    // Attach cookie directly to response with protocol-aware Secure flag
    const response = NextResponse.json({
      ok: true,
      user: { id: user.id, email: user.email, name: user.name, roles },
      expiresAt: expiresAt.toISOString(),
    });
    response.cookies.set(SESSION_COOKIE, token, getSessionCookieOptions(req));
    return response;
  } catch (err) {
    console.error("POST /api/auth/login error:", err);
    return NextResponse.json(
      { error: "Unable to sign in right now. Please try again shortly." },
      { status: 500 }
    );
  }
}
