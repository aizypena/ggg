import type { NextConfig } from "next";
import { buildSecurityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: buildSecurityHeaders().map(([key, value]) => ({ key, value })),
      },
    ];
  },
};

export default nextConfig;
