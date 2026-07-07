import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the World English Bible JSON available to the server chapter loader
  // in production without bundling any of it into client code.
  outputFileTracingIncludes: {
    "/app/bible/**": ["./src/data/bible/**"],
  },
};

export default nextConfig;
