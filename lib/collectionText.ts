// lib/collectionText.ts

/**
 * A collection as a list of cards and counts, and back to text.
 *
 * Collections are stored as the text people paste (lib/saved.ts), and an
 * Arena export or a paper binder list names the same card once per printing:
 *
 *     3 Lightning Bolt (M10) 146
 *     5 Lightning Bolt (2XM) 129
 *     4 Lightning Bolt [STA]
 *
 * Every consumer already treats those as one card — the Pack Planner's
 * analysis merges by name (lib/collectionParser.ts) — so showing them as
 * three lines only makes the list harder to read. `mergeCollection` folds
 * them into "12 Lightning Bolt", and `formatCollection` writes the merged
 * list back out as plain "qty name" lines, which every parser accepts.
 *
 * Pure and dependency-free, so the browser can run it: the Collection page
 * merges as you paste, with no round trip.
 */

export interface CollectionCard {
    name: string;
    qty: number;
}

/** Most anyone could own of one card — well past any real binder. */
const MAX_QTY = 9999;

/**
 * Printing markers that can trail a name: foil and etched flags in the forms
 * Moxfield, Deckbox and hand-typed lists use ("*F*", "*E*", "(F)", "(foil)").
 */
const FINISH_MARKER = /\s*(?:\*[A-Za-z]+\*|\((?:f|e|foil|etched)\))\s*$/i;
/** "(2XM) 129", "(M10)", "(PLST) LRW-256" at the end of a line. */
const SET_AND_NUMBER = /\s*\([A-Za-z0-9]{2,6}\)(?:\s+[\w★-]+)?\s*$/;

/**
 * "Lightning Bolt [M10]", "Lightning Bolt (M10) 146", "Lightning Bolt *F*",
 * "Lightning Bolt (2XM) 129 *F*" → "Lightning Bolt".
 *
 * Both trailing patterns are anchored at the end, so whichever sits last has
 * to come off before the other can match — Moxfield writes the foil marker
 * after the set, a hand-typed list might put it before. Rather than bet on
 * one order, strip until nothing changes. That loop is also what makes
 * tidyCollection idempotent: a single pass in the wrong order left
 * "Lightning Bolt (2XM) 129" behind on the first tidy and cleaned it on the
 * second, so the same collection saved twice came out different.
 */
function cleanName(raw: string): string {
    let name = raw.replace(/\s*\[[^\]]*\]/g, ""); // [SET], anywhere
    for (;;) {
        const next = name.replace(FINISH_MARKER, "").replace(SET_AND_NUMBER, "");
        if (next === name) break;
        name = next;
    }
    return name.replace(/\s+/g, " ").trim();
}

/**
 * What two spellings of one card have in common, for adding copies together.
 *
 * Case, accents, punctuation and spacing all drop out, so "Lim-Dûl's Vault"
 * meets "Lim-Dul's Vault" and "Sheoldred, the Apocalypse" meets "Sheoldred
 * the Apocalypse" — lists from different tools disagree on exactly those.
 * "æ" is spelled out as "ae" first because NFKD does not decompose it, and
 * stripping it would turn "Æther Vial" into "ther vial".
 *
 * Deliberately NOT lib/nameUtils' normalizeName: that one strips standalone
 * numbers (it is built to drop collector numbers from deck lines), which
 * would merge genuinely different cards whose names differ only by a number.
 * Here the name has already had its set and collector number cleaned off,
 * so every digit left is part of the name.
 *
 * A double-faced card is one card whichever way it's written: "Fable of the
 * Mirror-Breaker // Reflection of Kiki-Jiki" and plain "Fable of the
 * Mirror-Breaker" count together, so only the front face is keyed.
 */
export function cardKey(name: string): string {
    return name
        .split("//")[0]
        .normalize("NFKD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .replace(/æ/g, "ae")
        .replace(/œ/g, "oe")
        .replace(/[^a-z0-9\s]+/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

/** Splits one CSV line, honouring "quoted, fields". */
function csvFields(line: string): string[] {
    const out: string[] = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (quoted) {
            if (ch === '"' && line[i + 1] === '"') {
                cur += '"';
                i++;
            } else if (ch === '"') {
                quoted = false;
            } else {
                cur += ch;
            }
        } else if (ch === '"') {
            quoted = true;
        } else if (ch === ",") {
            out.push(cur);
            cur = "";
        } else {
            cur += ch;
        }
    }
    out.push(cur);
    return out.map((f) => f.trim());
}

/**
 * The cards in a CSV export with a header row (Arena tools, Moxfield,
 * Deckbox...), or null when the text isn't one.
 */
function fromCsv(lines: string[]): [string, number][] | null {
    const header = csvFields(lines[0].toLowerCase());
    const qtyCol = header.findIndex((h) => h === "quantity" || h === "count" || h === "qty");
    const nameCol = header.findIndex((h) => h === "name" || h === "card name" || h === "card");
    if (qtyCol < 0 || nameCol < 0) return null;

    const rows: [string, number][] = [];
    for (const line of lines.slice(1)) {
        const f = csvFields(line);
        const qty = parseInt(f[qtyCol] ?? "", 10);
        const name = cleanName(f[nameCol] ?? "");
        if (name && qty > 0) rows.push([name, qty]);
    }
    return rows;
}

/** "3 Lightning Bolt", "3x Lightning Bolt", or a bare name meaning one copy. */
function fromLines(lines: string[]): [string, number][] {
    const rows: [string, number][] = [];
    for (const line of lines) {
        // Section headers in deck-style exports ("Sideboard", "Deck").
        if (/^(deck|sideboard|commander|companion|maybeboard):?$/i.test(line)) continue;
        const m = line.match(/^(\d+)\s*x?\s+(.+)$/i);
        const qty = m ? parseInt(m[1], 10) : 1;
        const name = cleanName(m ? m[2] : line);
        if (name && qty > 0) rows.push([name, qty]);
    }
    return rows;
}

/**
 * Every card line in a pasted list, as written — one entry per line, before
 * any copies are added together. Section headers, comments and blank lines
 * are not rows. Exported so a caller can say how many lines a paste merged
 * from without counting "Deck" and "Sideboard" as cards.
 */
export function parseCollectionRows(text: string): CollectionCard[] {
    const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#") && !l.startsWith("//"));
    if (lines.length === 0) return [];

    const rows = fromCsv(lines) ?? fromLines(lines);
    return rows.map(([name, qty]) => ({ name, qty }));
}

/**
 * Every card once, with its copies added together (see cardKey for what
 * counts as the same card); the first spelling seen is the one kept. Order
 * follows first appearance, so a list someone typed keeps their order.
 */
export function mergeCollection(text: string): CollectionCard[] {
    return mergeCards(parseCollectionRows(text));
}

/** Adds together cards that share a name. */
export function mergeCards(cards: readonly CollectionCard[]): CollectionCard[] {
    const byKey = new Map<string, CollectionCard>();
    for (const c of cards) {
        const key = cardKey(c.name);
        if (!key || !(c.qty > 0)) continue;
        const have = byKey.get(key);
        if (have) have.qty = Math.min(MAX_QTY, have.qty + c.qty);
        else byKey.set(key, { name: c.name.replace(/\s+/g, " ").trim(), qty: Math.min(MAX_QTY, c.qty) });
    }
    return [...byKey.values()];
}

/** One "qty name" line per card, alphabetical — the form collections are saved in. */
export function formatCollection(cards: readonly CollectionCard[]): string {
    return [...cards]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => `${c.qty} ${c.name}`)
        .join("\n");
}

/** A pasted collection with duplicate printings folded together. */
export function tidyCollection(text: string): string {
    return formatCollection(mergeCollection(text));
}
