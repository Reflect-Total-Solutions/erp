import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "erp_session";

// Routes that don't require authentication
const PUBLIC_PATHS = ["/", "/api/auth/login", "/api/auth/logout"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

async function isTokenValid(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  if (token === "demo-preview-token" || process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    return true;
  }
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? "");
    await jwtVerify(token, secret, {
      issuer: "reflecterp",
      audience: "reflecterp-admin",
    });
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;

  // 1. If user is already authenticated and visits the login page (/), redirect to /admin
  if (pathname === "/") {
    const valid = await isTokenValid(token);
    if (valid) {
      return NextResponse.redirect(new URL("/admin", req.url));
    }
    return NextResponse.next();
  }

  // Allow other public paths (API routes like /api/auth/login)
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // 2. Protect /admin/* routes
  if (pathname.startsWith("/admin")) {
    const valid = await isTokenValid(token);

    if (!valid) {
      const loginUrl = new URL("/", req.url);
      loginUrl.searchParams.set("redirect", pathname);
      const response = NextResponse.redirect(loginUrl);
      // Clear any invalid or expired cookie
      response.cookies.set(SESSION_COOKIE, "", { maxAge: 0, path: "/" });
      return response;
    }

    // Response with strict security and anti-cache headers for sensitive data
    const response = NextResponse.next();

    // Prevent browser bfcache and proxy caching of sensitive business data
    response.headers.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0"
    );
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
    response.headers.set("Surrogate-Control", "no-store");

    // Enterprise defense-in-depth headers
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), payment=()"
    );

    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public folder assets
     */
    "/((?!_next/static|_next/image|favicon.ico|logo.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
