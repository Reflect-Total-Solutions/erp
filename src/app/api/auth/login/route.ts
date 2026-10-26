import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { createSessionToken, setSessionCookie } from "@/lib/auth";
import { checkRateLimit, LOGIN_RATE_LIMIT } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  // ── Rate limiting ────────────────────────────────────────────────────────
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  const rateLimit = checkRateLimit(`login:${ip}`, LOGIN_RATE_LIMIT);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error:
          "Too many login attempts. Please wait 15 minutes before trying again.",
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

  // ── Look up user ─────────────────────────────────────────────────────────
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: {
      roles: {
        include: { role: true },
      },
    },
  });

  // Constant-time comparison to prevent timing attacks
  const passwordValid =
    user !== null ? await verifyPassword(user.passwordHash, password) : false;

  // Log attempt (always, whether successful or not)
  await prisma.loginAttempt.create({
    data: {
      userId: user?.id ?? null,
      email: normalizedEmail,
      ipAddress: ip,
      userAgent,
      success: user !== null && passwordValid && user.isActive,
    },
  });

  // Generic error message to avoid user enumeration
  if (!user || !passwordValid || !user.isActive) {
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 }
    );
  }

  // ── Create session ───────────────────────────────────────────────────────
  const roles = user.roles.map((ur: { role: { name: string } }) => ur.role.name);

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

  // Set cookie and return
  await setSessionCookie(token);

  return NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email, name: user.name, roles },
    expiresAt: expiresAt.toISOString(),
  });
}
