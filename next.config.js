/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {}, // ← This silences the error and allows Webpack override
  webpack: (config) => {
    return config;
  },
};

module.exports = nextConfig;