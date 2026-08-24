// lib/goldfishUrl.ts

// A deck box counts as "just a link" only if it's a single bare
// MTGGoldfish deck (or archetype) URL with nothing else pasted alongside it.
export function isGoldfishDeckUrl(text: string): boolean {
    if (!text || text.includes("\n")) return false;

    let url: URL;
    try {
        url = new URL(text);
    } catch {
        return false;
    }

    const host = url.hostname.toLowerCase();
    return (
        (host === "mtggoldfish.com" || host === "www.mtggoldfish.com") &&
        (/\/deck\//.test(url.pathname) || /\/archetype\//.test(url.pathname))
    );
}
