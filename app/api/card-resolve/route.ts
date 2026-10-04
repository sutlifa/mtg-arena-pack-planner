// app/api/card-resolve/route.ts

import { NextResponse } from "next/server";
import { resolveCardName, suggestCardNames } from "@/lib/cardNames";
import { readJsonBody } from "@/lib/requestBody";

/**
 * Names per request. A whole Arena collection is a few thousand distinct
 * cards, so the Collection page sends it in chunks of this size rather than
 * the route accepting the lot — each request stays a bounded amount of work.
 * Resolving is a Map read per name, so 500 of them cost next to nothing.
 */
const MAX_NAMES = 500;
/** No card is anywhere near this; a longer "name" is a pasted paragraph. */
const MAX_NAME_LENGTH = 150;
/**
 * "Did you mean" is the expensive part — a pass over every card name, around
 * 15ms each — so only this many unrecognised names per request get
 * suggestions; the rest come back with an empty list. Someone pasting one or
 * two typos gets help with each; someone pasting a page of prose doesn't
 * get to spend seconds of server time on it.
 */
const MAX_SUGGESTED = 20;
const SUGGESTIONS_PER_NAME = 3;

type Result = { name: string } | { name: null; suggestions: string[] };

/**
 * The official card name for each name the Collection page is about to add,
 * or null with a few close real names when it isn't a card.
 *
 *     { names: ["lightning bolt", "Lightnig Bolt"] }
 *  →  { results: { "lightning bolt": { name: "Lightning Bolt" },
 *                  "Lightnig Bolt":  { name: null, suggestions: ["Lightning Bolt", ...] } } }
 *
 * Results are keyed by the name exactly as sent, so the page can map its own
 * rows back without re-deriving anything. `suggest: false` skips suggestions
 * entirely — the page checking a collection it already had only needs to
 * know which names aren't cards, not what they might have meant.
 *
 * Answered from the bundled card data (lib/cardNames), like card-search and
 * card-images, so it makes no outbound requests.
 */
export async function POST(req: Request) {
    const body = await readJsonBody(req);
    if (!body) {
        return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }

    const { names, suggest = true } = body;
    if (!Array.isArray(names) || names.length === 0) {
        return NextResponse.json({ error: "No card names given" }, { status: 400 });
    }
    if (names.length > MAX_NAMES) {
        return NextResponse.json(
            { error: `Too many cards at once (max ${MAX_NAMES})` },
            { status: 413 }
        );
    }

    try {
        // Built as entries, not by assigning onto `{}`: a card named
        // "__proto__" would set the object's prototype instead of a key.
        const entries: [string, Result][] = [];
        // Strings only, the same as card-images: there's no name to key an
        // answer by for a number or an object.
        const asked = new Set(names.filter((n): n is string => typeof n === "string"));
        let suggested = 0;
        for (const name of asked) {
            // An over-long name answers "not a card" for itself rather than
            // failing the request, so one pasted paragraph doesn't cost the
            // rest of the list its answers. It is never looked up.
            const official = name.length > MAX_NAME_LENGTH ? null : await resolveCardName(name);
            if (official) {
                entries.push([name, { name: official }]);
                continue;
            }
            const wantSuggestions =
                suggest !== false && name.length <= MAX_NAME_LENGTH && suggested < MAX_SUGGESTED;
            if (wantSuggestions) suggested++;
            entries.push([
                name,
                {
                    name: null,
                    suggestions: wantSuggestions ? suggestCardNames(name, SUGGESTIONS_PER_NAME) : [],
                },
            ]);
        }
        return NextResponse.json({ results: Object.fromEntries(entries) });
    } catch (err) {
        console.error("CARD RESOLVE ERROR:", err);
        return NextResponse.json({ error: "Could not check those card names" }, { status: 500 });
    }
}
