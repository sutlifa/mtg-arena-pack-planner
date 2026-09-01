// app/api/import-deck/route.ts

import { NextResponse } from "next/server";

const GOLDFISH_UA = "MTG Arena Pack Planner (deck import)";

/** Give up on a slow upstream rather than holding the function open. */
const FETCH_TIMEOUT_MS = 10_000;

/** Redirects are followed by hand (see goldfishFetch); this bounds the chain. */
const MAX_REDIRECTS = 3;

/** An archetype page is HTML; anything far larger than this isn't one. */
const MAX_RESPONSE_BYTES = 2_000_000;

function isGoldfishUrl(url: URL): boolean {
    const host = url.hostname.toLowerCase();
    return host === "mtggoldfish.com" || host === "www.mtggoldfish.com";
}

/** Only https, and only MTGGoldfish. */
function isAllowedTarget(url: URL): boolean {
    return url.protocol === "https:" && isGoldfishUrl(url);
}

/**
 * Fetches an MTGGoldfish URL, following redirects manually so the allowlist
 * is re-checked at every hop.
 *
 * `fetch` follows redirects automatically by default, which means a 3xx from
 * the upstream — not from anything the user controls — could point the server
 * at an internal address (cloud metadata, localhost) and, for the download
 * request whose body we return to the caller, hand that content back. The
 * user-supplied URL is already allowlisted; this closes the same hole on the
 * upstream-controlled side. Every hop must still be https and still be
 * MTGGoldfish, and the request to a disallowed host is never issued at all.
 */
async function goldfishFetch(startUrl: string): Promise<Response | null> {
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

        // 3xx: resolve Location against the current URL and re-validate on
        // the next pass rather than letting fetch chase it for us.
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
async function readCappedText(res: Response): Promise<string | null> {
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared > MAX_RESPONSE_BYTES) return null;

    const text = await res.text();
    if (text.length > MAX_RESPONSE_BYTES) return null;

    return text;
}

// Resolves a pasted MTGGoldfish URL to the plain-text decklist download
// URL for the deck it points at. Only ever touches mtggoldfish.com —
// never an arbitrary user-supplied URL — to avoid turning this into an
// open server-side fetch proxy.
async function resolveDownloadUrl(rawUrl: string): Promise<string | null> {
    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        return null;
    }

    if (!isGoldfishUrl(url)) return null;

    // Direct deck link, e.g. /deck/1234567 or /deck/download/1234567
    const deckMatch = url.pathname.match(/^\/deck\/(?:download\/)?(\d+)/);
    if (deckMatch) {
        return `https://www.mtggoldfish.com/deck/download/${deckMatch[1]}`;
    }

    // Archetype "home page" for a deck, e.g.
    // /archetype/standard-4c-control-woe — no direct decklist here, but the
    // page embeds a download link for its featured representative deck.
    if (/^\/archetype\//.test(url.pathname)) {
        // Force https regardless of what was pasted — the pasted URL is only
        // trusted for its host and path, not its scheme.
        const pageUrl = new URL(url.pathname + url.search, "https://www.mtggoldfish.com");

        const pageRes = await goldfishFetch(pageUrl.toString());
        if (!pageRes || !pageRes.ok) return null;

        const html = await readCappedText(pageRes);
        if (!html) return null;

        const downloadMatch = html.match(/href="(\/deck\/download\/\d+)"/);
        if (!downloadMatch) return null;

        return `https://www.mtggoldfish.com${downloadMatch[1]}`;
    }

    return null;
}

export async function POST(req: Request) {
    try {
        const { url } = await req.json();

        if (typeof url !== "string" || !url.trim()) {
            return NextResponse.json({ error: "Missing deck URL" }, { status: 400 });
        }

        const downloadUrl = await resolveDownloadUrl(url.trim());
        if (!downloadUrl) {
            return NextResponse.json(
                { error: "That doesn't look like an MTGGoldfish deck or archetype link" },
                { status: 400 }
            );
        }

        const res = await goldfishFetch(downloadUrl);

        if (!res || !res.ok) {
            return NextResponse.json(
                { error: "Could not fetch that deck from MTGGoldfish" },
                { status: 502 }
            );
        }

        const body = await readCappedText(res);
        const decklist = body?.trim();

        if (!decklist) {
            return NextResponse.json({ error: "That deck appears to be empty" }, { status: 502 });
        }

        return NextResponse.json({ decklist });

    } catch (err) {
        console.error("IMPORT DECK ERROR:", err);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
