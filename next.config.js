/** @type {import('next').NextConfig} */
const nextConfig = {
    turbopack: {}, // keeps Turbopack happy
    webpack: (config) => {
        return config;
    },

    // Allow your mobile device to load dev resources
    allowedDevOrigins: ['192.168.68.50'],

    // Card art and set icons are hotlinked from Scryfall's CDN.
    images: {
        remotePatterns: [
            { protocol: 'https', hostname: 'cards.scryfall.io' },
            { protocol: 'https', hostname: 'svgs.scryfall.io' },
        ],
    },
};

module.exports = nextConfig;
