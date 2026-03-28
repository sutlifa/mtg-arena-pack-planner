import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {}, // required to silence the warning
  webpack: (config) => {
    return config; // enabling this forces Webpack
  },
};

export default nextConfig;