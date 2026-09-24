// app/api/card-images/route.ts

import { NextResponse } from "next/server";
import { lookupCard } from "@/lib/scryfall";
import { readJsonBody } from "@/lib/requestBody";

/**
 * A deck is 60–100 lines and a sideboard 15; this is comfortably above both
 * and well short of letting one request walk the whole card database.
 */
const MAX_NAMES = 150;
const MAX_NAME_LENGTH = 150;

interface Images {
    image_uris?: { normal?: string } | null;
}

/** The printing's art, or the front face's for a double-faced card. */
function imageOf(card: Images & { raw?: { card_faces?: Images[] } }): string | null {
    return (
        card.image_uris?.normal ??
        card.raw?.card_faces?.[0]?.image_uris?.normal ??
        card.raw?.card_faces?.[1]?.image_uris?.normal ??
        null
    );
}

/**
 * Card images for a list of names, for the Sideboard Planner's opponent
 * decklist and the Collection page's tiles.
 *
 * Answered from lib/data/cards-min.json — the same data the Pack Planner
 * uses — rather than from Scryfall's API, so showing a 75-card list costs no
 * outbound requests at all; only the images themselves come from Scryfall's
 * CDN, as they already do on the Pack Planner. Paper printings are preferred,
 * matching what an MTGGoldfish list shows.
 *
 * Unknown names come back as null rather than failing the request: one
 * unrecognised card (a brand-new set, a typo in the source list) shouldn't
 * cost the other seventy-four their pictures.
 */
export async function POST(req: Request) {
    const body = await readJsonBody(req);
    if (!body) {
        return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }

    const { names } = body;
    if (!Array.isArray(names) || names.length === 0) {
        return NextResponse.json({ error: "No card names given" }, { status: 400 });
    }
    if (names.length > MAX_NAMES) {
        return NextResponse.json(
            { error: `Too many cards (max ${MAX_NAMES})` },
            { status: 413 }
        );
    }

    try {
        // Built as entries, not by assigning onto `{}`: a card named
        // "__proto__" would set the object's prototype instead of a key.
        const entries: [string, string | null][] = [];
        // Strings only: there's no name to key an answer by for a number or
        // an object, so those are left out rather than guessed at.
        const asked = new Set(
            names.filter((n): n is string => typeof n === "string").map((n) => n.trim())
        );
        for (const name of asked) {
            // One bad name answers null for itself, the same as an unknown
            // card, instead of rejecting the whole request. The Collection
            // page asks about a whole page of tiles at once, and a single
            // pasted paragraph in someone's collection used to cost every
            // other card on the page its picture. The length cap still
            // bounds the work: an over-long name is never looked up.
            if (!name || name.length > MAX_NAME_LENGTH) {
                entries.push([name, null]);
                continue;
            }
            const card = await lookupCard(name, false);
            entries.push([name, card.failed ? null : imageOf(card)]);
        }
        return NextResponse.json({ images: Object.fromEntries(entries) });
    } catch (err) {
        console.error("CARD IMAGES ERROR:", err);
        return NextResponse.json({ error: "Could not look up those cards" }, { status: 500 });
    }
}
