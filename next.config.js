/** @type {import('next').NextConfig} */
const nextConfig = {
    turbopack: {}, // keeps Turbopack happy
    webpack: (config) => {
        return config;
    },

    // Allow a LAN device (e.g. a phone) to load dev resources. Set
    // DEV_ORIGIN to your machine's LAN IP when testing on another device;
    // it's read from the environment so a private network address isn't
    // committed to a public repo. Dev-only — ignored in production builds.
    allowedDevOrigins: process.env.DEV_ORIGIN ? [process.env.DEV_ORIGIN] : [],

    // Card art and set icons are hotlinked from Scryfall's CDN.
    images: {
        remotePatterns: [
            { protocol: 'https', hostname: 'cards.scryfall.io' },
            { protocol: 'https', hostname: 'svgs.scryfall.io' },
        ],
    },
};

module.exports = nextConfig;
