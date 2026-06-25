import { NextResponse } from "next/server";
import { withAuth } from "next-auth/middleware";
import { buildSecurityHeaders } from "@/lib/security-headers";

function isProtectedPath(pathname: string): boolean {
  // /tournaments/[id] is public-read; everything else under /tournaments is protected
  if (pathname === "/tournaments" || pathname.startsWith("/tournaments/")) {
    // /tournaments/[id] and /tournaments/[id]/... except settle are public
    const tournamentDetailPattern = /^\/tournaments\/[^/]+/;
    if (tournamentDetailPattern.test(pathname)) {
      // settle is protected; everything else under [id] is public
      if (pathname.endsWith("/settle") || pathname.includes("/settle/")) {
        return true;
      }
      return false;
    }
    return true;
  }
  if (pathname.startsWith("/admin")) return true;
  return false;
}

export default withAuth(
  function middleware(req) {
    const response = isProtectedPath(req.nextUrl.pathname)
      ? NextResponse.redirect(new URL("/login", req.url))
      : NextResponse.next();

    for (const [key, value] of buildSecurityHeaders()) {
      response.headers.set(key, value);
    }

    return response;
  },
  {
    callbacks: {
      authorized({ token }) {
        // If token is present, user is authenticated
        if (token) return true;
        // Allow unauthenticated through so we can redirect with security headers
        return true;
      },
    },
  }
);

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
