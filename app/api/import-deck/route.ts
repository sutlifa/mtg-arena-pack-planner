// app/api/import-deck/route.ts

import { NextResponse } from "next/server";

const GOLDFISH_UA = "MTG Arena Pack Planner (deck import)";

function isGoldfishUrl(url: URL): boolean {
    const host = url.hostname.toLowerCase();
    return host === "mtggoldfish.com" || host === "www.mtggoldfish.com";
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
        const pageRes = await fetch(url.toString(), {
            headers: { "User-Agent": GOLDFISH_UA },
        });
        if (!pageRes.ok) return null;

        const html = await pageRes.text();
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

        const res = await fetch(downloadUrl, {
            headers: { "User-Agent": GOLDFISH_UA },
        });

        if (!res.ok) {
            return NextResponse.json(
                { error: "Could not fetch that deck from MTGGoldfish" },
                { status: 502 }
            );
        }

        const decklist = (await res.text()).trim();
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
