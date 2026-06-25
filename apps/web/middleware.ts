import { NextResponse } from "next/server";
import { withAuth } from "next-auth/middleware";
import { buildSecurityHeaders } from "@/lib/security-headers";

export function isProtectedPath(pathname: string): boolean {
  // /tournaments/[id] is public-read; everything else under /tournaments is protected
  if (pathname === "/tournaments" || pathname === "/tournaments/") return true;
  if (pathname === "/tournaments/new" || pathname.startsWith("/tournaments/new/")) return true;
  if (/^\/tournaments\/[^/]+\/settle$/.test(pathname)) return true;
  // Single-segment /tournaments/[id] and any deeper non-settle paths are public
  if (/^\/tournaments\/[^/]+/.test(pathname)) return false;
  if (pathname.startsWith("/admin")) return true;
  return false;
}

export default withAuth(
  function middleware(_req) {
    // Authentication is enforced by the withAuth authorized callback below.
    // This function runs only for allowed requests and applies security headers.
    const response = NextResponse.next();

    for (const [key, value] of buildSecurityHeaders()) {
      response.headers.set(key, value);
    }

    return response;
  },
  {
    callbacks: {
      authorized({ token, req }) {
        // Public paths are always allowed
        if (!isProtectedPath(req.nextUrl.pathname)) return true;
        // Protected paths require a valid session token
        return !!token;
      },
    },
    pages: {
      signIn: "/login",
    },
  }
);

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
