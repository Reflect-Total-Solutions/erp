import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifySessionToken, clearSessionCookie, SESSION_COOKIE } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    const payload = await verifySessionToken(token);
    if (payload?.jti && payload?.exp) {
      // Revoke the token so it cannot be reused even if someone has a copy
      try {
        await prisma.revokedToken.create({
          data: {
            jti: payload.jti as string,
            userId: payload.userId,
            expiresAt: new Date((payload.exp as number) * 1000),
          },
        });

        await prisma.auditLog.create({
          data: {
            userId: payload.userId,
            action: "LOGOUT",
            resource: "auth",
            ipAddress:
              req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
              req.headers.get("x-real-ip") ??
              "unknown",
          },
        });
      } catch {
        // If token was already revoked or DB error, still clear cookie
      }
    }
  }

  await clearSessionCookie();

  return NextResponse.json({ ok: true });
}
