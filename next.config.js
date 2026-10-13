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

    // The Pack Planner became Deck Check, at a new address. Old links — the
    // nav before the rename, bookmarks, and the profile's ?deck= /
    // ?collection= / ?analysis= links — must keep working, so /planner is a
    // permanent redirect. Next passes the query string through to the
    // destination untouched, which is what carries those ids across.
    //
    // /collection?deck=<id> was the Collection page's "Compare with a deck".
    // That comparison now lives in Deck Check, so a link that still asks for
    // it is sent there with the same ?deck=. Only when ?deck= is present: a
    // plain /collection (or ?collection=<id>, which opens a saved collection
    // there) is the Collection page as ever.
    async redirects() {
        return [
            { source: '/planner', destination: '/deck-check', permanent: true },
            {
                source: '/collection',
                has: [{ type: 'query', key: 'deck' }],
                destination: '/deck-check',
                permanent: true,
            },
        ];
    },

    // Card art and set icons are hotlinked from Scryfall's CDN.
    images: {
        remotePatterns: [
            { protocol: 'https', hostname: 'cards.scryfall.io' },
            { protocol: 'https', hostname: 'svgs.scryfall.io' },
        ],
    },
};

module.exports = nextConfig;
