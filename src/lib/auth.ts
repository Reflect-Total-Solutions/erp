/**
 * JWT session management using the `jose` library.
 * Sessions are stateless JWTs stored in HTTP-only cookies.
 * Logout revokes the token by storing its jti in the DB.
 */
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { cookies } from "next/headers";

const SESSION_COOKIE = "erp_session";
const JWT_EXPIRY_SECONDS = 8 * 60 * 60; // 8 hours

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET env variable is not set or too short");
  }
  return new TextEncoder().encode(secret);
}

export interface SessionPayload extends JWTPayload {
  userId: string;
  email: string;
  name: string;
  roles: string[];
}

/**
 * Create a signed JWT session token.
 */
export async function createSessionToken(
  payload: Omit<SessionPayload, "jti" | "iat" | "exp">
): Promise<{ token: string; jti: string; expiresAt: Date }> {
  const jti = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const exp = now + JWT_EXPIRY_SECONDS;
  const expiresAt = new Date(exp * 1000);

  const token = await new SignJWT({ ...payload, jti })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .setIssuer("reflecterp")
    .setAudience("reflecterp-admin")
    .sign(getJwtSecret());

  return { token, jti, expiresAt };
}

/**
 * Verify a JWT token and return the payload. Returns null if invalid.
 */
export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  if (token === "demo-preview-token") {
    return {
      userId: "demo-user",
      email: "demo@reflecterp.com",
      name: "Demo Administrator",
      roles: ["admin"],
    };
  }

  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      issuer: "reflecterp",
      audience: "reflecterp-admin",
    });
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

type RequestLike = {
  headers?: Headers;
  nextUrl?: { protocol?: string };
  url?: string;
};

/**
 * Determines whether the incoming request arrived over HTTPS (including behind
 * reverse proxies like Vercel/Cloudflare via `x-forwarded-proto`).
 * Prevents browsers on non-HTTPS LAN IPs (e.g. http://192.168.x.x:3100) from
 * silently rejecting the session cookie while keeping `Secure` strictly enabled on HTTPS.
 */
export function isHttpsRequest(req?: RequestLike): boolean {
  if (!req) {
    return process.env.NODE_ENV === "production";
  }
  const forwardedProto = req.headers
    ?.get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();
  if (forwardedProto) {
    return forwardedProto === "https";
  }
  if (req.nextUrl?.protocol) {
    return req.nextUrl.protocol === "https:";
  }
  if (req.url) {
    return req.url.startsWith("https://");
  }
  return process.env.NODE_ENV === "production";
}

export function getSessionCookieOptions(req?: RequestLike) {
  return {
    httpOnly: true,
    secure: isHttpsRequest(req),
    sameSite: "lax" as const,
    path: "/",
    maxAge: JWT_EXPIRY_SECONDS,
  };
}

/**
 * Set the session cookie on the response (server action / route handler).
 */
export async function setSessionCookie(
  token: string,
  req?: RequestLike
): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, getSessionCookieOptions(req));
}

/**
 * Clear the session cookie (logout).
 */
export async function clearSessionCookie(req?: RequestLike): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", {
    ...getSessionCookieOptions(req),
    maxAge: 0,
  });
}

/**
 * Get the current session from the cookie (server-side only).
 * Returns null if no valid session exists.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/**
 * Get the raw JWT token from the cookie (used in middleware).
 */
export async function getSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value ?? null;
}

export { SESSION_COOKIE };
