/**
 * Reusable API route authentication helper.
 * Verifies the JWT session token from cookies and returns the session payload.
 * Use in all protected API routes.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, type SessionPayload } from "@/lib/auth";

const SESSION_COOKIE = "erp_session";

export interface AuthenticatedRequest {
  session: SessionPayload;
  ip: string;
  userAgent: string | undefined;
}

/**
 * Authenticate an API request.
 * Returns either the authenticated context or a 401 JSON response.
 */
export async function authenticateRequest(
  req: NextRequest
): Promise<AuthenticatedRequest | NextResponse> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;

  if (!token) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  const session = await verifySessionToken(token);

  if (!session) {
    return NextResponse.json(
      { error: "Invalid or expired session" },
      { status: 401 }
    );
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  const userAgent = req.headers.get("user-agent") ?? undefined;

  return { session, ip, userAgent };
}

/**
 * Type guard to check if authentication succeeded.
 */
export function isAuthenticated(
  result: AuthenticatedRequest | NextResponse
): result is AuthenticatedRequest {
  return !(result instanceof NextResponse);
}

/**
 * Check if user has admin role.
 */
export function isAdmin(session: SessionPayload): boolean {
  return session.roles.includes("admin");
}
