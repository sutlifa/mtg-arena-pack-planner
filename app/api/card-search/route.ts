// app/api/card-search/route.ts

import { NextResponse } from "next/server";
import { getCardData } from "@/lib/cardDataStore";
import { normalizeName } from "@/lib/nameUtils";

const MAX_QUERY_LENGTH = 60;
const MAX_RESULTS = 12;

/**
 * normalizeName folds accents with NFKD, but "æ" and "œ" are letters of their
 * own that NFKD leaves alone — so its punctuation pass deleted them, and
 * "Æther" searched as "ther". Spelled out first, on both sides of the match,
 * so "aether", "æther" and "Æther Vial" all find each other.
 */
function searchKey(s: string): string {
    return normalizeName(s.replace(/[æÆ]/g, "ae").replace(/[œŒ]/g, "oe"));
}

/**
 * Every distinct card name, with its search key, built once per server
 * process from the bundled card data — the same data the Pack Planner uses.
 */
let index: { name: string; key: string }[] | null = null;
function names() {
    if (!index) {
        const seen = new Set<string>();
        index = [];
        for (const card of getCardData()) {
            if (seen.has(card.name)) continue;
            seen.add(card.name);
            index.push({ name: card.name, key: searchKey(card.name) });
        }
        index.sort((a, b) => a.name.localeCompare(b.name));
    }
    return index;
}

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
    if (q.length > MAX_QUERY_LENGTH) {
        return NextResponse.json({ error: "Search is too long" }, { status: 400 });
    }

    const key = searchKey(q);
    if (key.length < 2) return NextResponse.json({ names: [] });

    try {
        const typed = key.split(" ");
        const starts: string[] = [];
        const wordStarts: string[] = [];
        const contains: string[] = [];
        for (const n of names()) {
            if (n.key.startsWith(key)) {
                starts.push(n.name);
            } else {
                const words = n.key.split(" ");
                if (typed.every((t) => words.some((w) => w.startsWith(t)))) wordStarts.push(n.name);
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
