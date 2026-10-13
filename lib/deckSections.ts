// lib/deckSections.ts

import { extractQtyAndName } from "./lineParse";

export interface DeckCard {
    qty: number;
    name: string;
}

export interface DeckSections {
    maindeck: DeckCard[];
    sideboard: DeckCard[];
}

/**
 * Splits a pasted decklist into maindeck and sideboard.
 *
 * This is deliberately separate from lib/deckParser's parseDecklist, which
 * treats a blank line as "a second deck" and merges everything together —
 * correct for Deck Check's analysis, wrong here, where the whole point is keeping
 * the two halves apart.
 *
 * Two conventions are supported, because the app accepts lists from both
 * MTGGoldfish and Arena:
 *
 *  - An explicit section marker ("Sideboard", "SB:", "Deck", ...). Arena's
 *    exports use these.
 *  - A single blank line separating the halves. MTGGoldfish's plain-text
 *    download uses this and nothing else — it has no "Sideboard" line at all,
 *    so splitting on the marker alone would silently produce a 75-card
 *    maindeck and an empty sideboard.
 *
 * Runs on the client: the autocomplete sources are just the deck's own cards,
 * so no card database or network round-trip is needed.
 */

const MAIN_MARKERS = /^(deck|maindeck|main deck|main|commander)\s*:?\s*$/i;
const SIDE_MARKERS = /^(sideboard|side board|sb)\s*:?\s*$/i;
/**
 * Arena's export puts the companion in its own "Companion" section AND lists
 * it again under "Sideboard", where it really lives. Reading "Companion" as
 * just another sideboard marker counted it twice (2 Lurrus in a 15-card
 * sideboard that holds one). So companion lines are held apart and folded in
 * at the end: a companion the sideboard already lists adds nothing, and one
 * it doesn't (a list with a Companion section but no Sideboard entry for it)
 * still lands in the sideboard, as before.
 */
const COMPANION_MARKERS = /^companion\s*:?\s*$/i;

/**
 * Strips printing information that Arena and some exporters append, so
 * "4 Lightning Bolt (2XM) 129" and "4 Lightning Bolt [2XM]" both read as
 * "Lightning Bolt" and therefore match each other in the autocomplete.
 */
export function cleanCardName(raw: string): string {
    return raw
        .replace(/\s*\([A-Za-z0-9]{2,6}\)\s*\d*\s*$/, "") // (SET) 123
        .replace(/\s*\[[A-Za-z0-9]{2,6}\]\s*$/, "")       // [SET]
        .replace(/\s*<[^>]*>\s*$/, "")                    // <foil> etc.
        .trim();
}

/** Adds a card to a section, summing duplicates rather than repeating them. */
function push(list: DeckCard[], qty: number, name: string) {
    const existing = list.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (existing) existing.qty += qty;
    else list.push({ qty, name });
}

export function splitDeckSections(text: string): DeckSections {
    const maindeck: DeckCard[] = [];
    const sideboard: DeckCard[] = [];
    const companions: DeckCard[] = [];

    if (!text || !text.trim()) return { maindeck, sideboard };

    // Normalise line endings — MTGGoldfish returns CRLF.
    const rawLines = text.replace(/\r\n?/g, "\n").split("\n");

    let inSideboard = false;
    let inCompanion = false;
    let sawExplicitMarker = false;
    let sawCardYet = false;
    let blankRun = false;

    for (const rawLine of rawLines) {
        const line = rawLine.trim();

        if (!line) {
            // Remember that a gap happened; only acts as a separator if no
            // explicit marker is ever used and we've already seen cards.
            if (sawCardYet) blankRun = true;
            continue;
        }

        if (line.startsWith("//") || line.startsWith("#")) continue;

        if (MAIN_MARKERS.test(line)) {
            sawExplicitMarker = true;
            inSideboard = false;
            inCompanion = false;
            blankRun = false;
            continue;
        }

        if (SIDE_MARKERS.test(line)) {
            sawExplicitMarker = true;
            inSideboard = true;
            inCompanion = false;
            blankRun = false;
            continue;
        }

        if (COMPANION_MARKERS.test(line)) {
            sawExplicitMarker = true;
            inCompanion = true;
            blankRun = false;
            continue;
        }

        const parsed = extractQtyAndName(line);
        if (!parsed) continue;

        // A blank line only means "sideboard starts here" when the list
        // never used explicit markers (the MTGGoldfish case).
        if (blankRun && !sawExplicitMarker && sawCardYet) {
            inSideboard = true;
        }
        blankRun = false;
        sawCardYet = true;

        const name = cleanCardName(parsed.rawName);
        if (!name) continue;

        push(inCompanion ? companions : inSideboard ? sideboard : maindeck, parsed.qty, name);
    }

    // See COMPANION_MARKERS: only a companion the sideboard doesn't already
    // list is added to it.
    for (const c of companions) {
        const listed = sideboard.some((s) => s.name.toLowerCase() === c.name.toLowerCase());
        if (!listed) push(sideboard, c.qty, c.name);
    }

    return { maindeck, sideboard };
}

export function totalCards(list: DeckCard[]): number {
    return list.reduce((sum, c) => sum + c.qty, 0);
}
