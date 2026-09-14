// lib/goldfishFetch.ts

/**
 * Shared, hardened fetch for MTGGoldfish.
 *
 * Extracted from /api/import-deck so every route that talks to MTGGoldfish
 * inherits the same protections rather than growing its own weaker copy:
 *
 *  - Only ever https, and only ever mtggoldfish.com. A request to any other
 *    host is never issued at all.
 *  - Redirects are followed by hand so the allowlist is re-checked at every
 *    hop. `fetch` follows them automatically by default, which would let a
 *    3xx from the upstream — not from anything the user controls — point the
 *    server at an internal address and, for calls whose body we return to the
 *    caller, hand that content back.
 *  - Every request is bounded by a timeout, and every body by a size cap.
 */

const GOLDFISH_UA = "MTG Arena Pack Planner (deck import)";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

export function isGoldfishHost(url: URL): boolean {
    const host = url.hostname.toLowerCase();
    return host === "mtggoldfish.com" || host === "www.mtggoldfish.com";
}

function isAllowedTarget(url: URL): boolean {
    return url.protocol === "https:" && isGoldfishHost(url);
}

export async function goldfishFetch(startUrl: string): Promise<Response | null> {
    let current = startUrl;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        let parsed: URL;
        try {
            parsed = new URL(current);
        } catch {
            return null;
        }

        if (!isAllowedTarget(parsed)) return null;

        const res = await fetch(parsed.toString(), {
            headers: { "User-Agent": GOLDFISH_UA },
            redirect: "manual",
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });

        if (res.status >= 300 && res.status < 400) {
            const location = res.headers.get("location");
            if (!location) return null;
            current = new URL(location, parsed).toString();
            continue;
        }

        return res;
    }

    return null; // too many redirects
}

/** Reads a response body, refusing anything implausibly large. */
export async function readCappedText(res: Response, maxBytes: number): Promise<string | null> {
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared > maxBytes) return null;

    const text = await res.text();
    if (text.length > maxBytes) return null;

    return text;
}
