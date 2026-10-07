import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Chat runs two LLM calls and uploads embed a whole PDF; the 30s default
    // rewrite timeout is too tight for a slow provider response.
    proxyTimeout: 120_000,
  },
  async rewrites() {
    const backendUrl = process.env.BACKEND_API_URL ?? "http://127.0.0.1:8000";

    return [
      {
        source: "/api/backend/:path*",
        destination: `${backendUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
