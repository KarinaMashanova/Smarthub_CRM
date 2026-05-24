import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.0.123'],
  turbopack: {
    root: process.cwd(),
  },
  transpilePackages: ['recharts'],
};

export default nextConfig;
