/** @type {import('next').NextConfig} */
const nextConfig = {
    turbopack: {}, // keeps Turbopack happy
    webpack: (config) => {
        return config;
    },

    // Allow your mobile device to load dev resources
    allowedDevOrigins: ['192.168.68.50'],
};

module.exports = nextConfig;
