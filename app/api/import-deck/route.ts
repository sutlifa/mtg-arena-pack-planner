// app/api/import-deck/route.ts

import { NextResponse } from "next/server";

// Only ever fetch mtggoldfish.com's own decklist download endpoint —
// never an arbitrary user-supplied URL — to avoid turning this into an
// open server-side fetch proxy.
function extractGoldfishDeckId(rawUrl: string): string | null {
    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        return null;
    }

    const host = url.hostname.toLowerCase();
    if (host !== "mtggoldfish.com" && host !== "www.mtggoldfish.com") {
        return null;
    }

    const match = url.pathname.match(/\/deck\/(?:download\/)?(\d+)/);
    return match ? match[1] : null;
}

export async function POST(req: Request) {
    try {
        const { url } = await req.json();

        if (typeof url !== "string" || !url.trim()) {
            return NextResponse.json({ error: "Missing deck URL" }, { status: 400 });
        }

        const deckId = extractGoldfishDeckId(url.trim());
        if (!deckId) {
            return NextResponse.json(
                { error: "That doesn't look like an MTGGoldfish deck link" },
                { status: 400 }
            );
        }

        const res = await fetch(`https://www.mtggoldfish.com/deck/download/${deckId}`, {
            headers: { "User-Agent": "MTG Arena Pack Planner (deck import)" },
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
