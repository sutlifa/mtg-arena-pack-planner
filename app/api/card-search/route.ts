// app/api/card-search/route.ts

import { NextResponse } from "next/server";
// The name index and searchKey live in lib/cardNames, shared with
// /api/card-resolve: a suggestion picked here and a name resolved there are
// always the same spelling, because they come from the same list.
import { cardNameEntries, searchKey } from "@/lib/cardNames";
import { MAX_CARD_SEARCH_CHARS } from "@/lib/inputLimits";

const MAX_RESULTS = 12;

/**
 * Card-name suggestions for the Collection page's "add a card" box.
 *
 * Names that start with what's typed come first. Then names where every
 * typed word starts one of the name's words, in any order — so "li bo" or
 * "bolt light" finds Lightning Bolt without typing it out. Then anything else
 * that contains the text. Matching ignores case, accents and punctuation,
 * the same way collections are matched against decks.
 */
export async function GET(req: Request) {
    const q = new URL(req.url).searchParams.get("q") ?? "";
    if (q.length > MAX_CARD_SEARCH_CHARS) {
        return NextResponse.json({ error: "Search is too long" }, { status: 400 });
    }

    const key = searchKey(q);
    if (key.length < 2) return NextResponse.json({ names: [] });

    try {
        const typed = key.split(" ");
        const starts: string[] = [];
        const wordStarts: string[] = [];
        const contains: string[] = [];
        for (const n of cardNameEntries()) {
            if (n.key.startsWith(key)) {
                starts.push(n.name);
            } else {
                if (typed.every((t) => n.words.some((w) => w.startsWith(t)))) wordStarts.push(n.name);
                else if (n.key.includes(key)) contains.push(n.name);
            }
            if (starts.length >= MAX_RESULTS) break;
        }
        return NextResponse.json({
            names: [...starts, ...wordStarts, ...contains].slice(0, MAX_RESULTS),
        });
    } catch (err) {
        console.error("CARD SEARCH ERROR:", err);
        return NextResponse.json({ error: "Could not search cards" }, { status: 500 });
    }
}
