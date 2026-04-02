// lib/aliasResolver.ts

declare global {
    interface Window {
        __CARD_ALIASES__?: Record<string, string>;
    }
}

/** Normalize user input so punctuation/casing differences don't break aliasing */
function normalizeKey(name: string): string {
    return name
        .toLowerCase()
        .trim()
        .replace(/[\u2013\u2014]/g, "-")   // normalize long dashes
        .replace(/[^a-z0-9\- ]+/g, "")     // strip weird punctuation
        .replace(/\s+/g, " ");             // collapse spaces
}

export function resolveName(name: string): string {
    const key = normalizeKey(name);

    if (typeof window !== "undefined" && window.__CARD_ALIASES__) {
        const resolved = window.__CARD_ALIASES__[key];
        if (resolved) return resolved;
    }

    return key;
}
