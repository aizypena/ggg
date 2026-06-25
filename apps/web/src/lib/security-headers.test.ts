import { describe, it, expect } from "vitest";
import { buildSecurityHeaders } from "./security-headers";

describe("buildSecurityHeaders", () => {
  it("returns expected header names", () => {
    const headers = buildSecurityHeaders();
    const names = headers.map(([key]) => key);
    expect(names).toContain("Content-Security-Policy");
    expect(names).toContain("X-Content-Type-Options");
    expect(names).toContain("Referrer-Policy");
    expect(names).toContain("Strict-Transport-Security");
    expect(names).toContain("X-Frame-Options");
    expect(names).toContain("Permissions-Policy");
  });

  it("CSP contains default-src 'self' and frame-ancestors 'none'", () => {
    const headers = buildSecurityHeaders();
    const csp = headers.find(([key]) => key === "Content-Security-Policy")?.[1];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });
});
