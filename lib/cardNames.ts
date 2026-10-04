// lib/cardNames.ts

import { getCardData } from "./cardDataStore";
import { normalizeName } from "./nameUtils";
import { lookupCard } from "./scryfall";
import { serverAliasMap } from "./serverAliasMap";
import { cleanName } from "./collectionText";

/**
 * Every real card name, and the ways people actually write them.
 *
 * The Collection page only keeps cards that exist, under their official
 * names. Whatever was typed or pasted — "lightning bolt", "Lim-Dul's Vault",
 * "aether vial", "Fable of the Mirror Breaker", a double-faced card's back
 * face, an Arena-only name — is resolved here, against the same bundled card
 * data the Pack Planner uses, so the answer costs no outbound request.
 *
 * Server-only (it reads lib/data/cards-min.json through cardDataStore). The
 * index is built once per server process; after that every lookup is a Map
 * read, so a few thousand collection lines resolve in milliseconds.
 */

/**
 * normalizeName folds accents with NFKD, but "æ" and "œ" are letters of their
 * own that NFKD leaves alone — so its punctuation pass deleted them, and
 * "Æther" searched as "ther". Spelled out first, on both sides of the match,
 * so "aether", "æther" and "Æther Vial" all find each other.
 */
export function searchKey(s: string): string {
    return normalizeName(s.replace(/[æÆ]/g, "ae").replace(/[œŒ]/g, "oe"));
}

/**
 * Letters and digits only — the strictest key that still ignores everything
 * people get wrong when typing a name.
 *
 * Not searchKey, for two reasons. normalizeName turns hyphens into spaces but
 * deletes apostrophes, so "Mirror-Breaker" and "Mirror Breaker" agree but
 * "Lim-Dûl's" and "Lim Dul s" don't; dropping every space and mark makes
 * all of those one key. And normalizeName strips standalone numbers (it is
 * built to drop collector numbers off deck lines), which would make
 * "Borrowing 100,000 Arrows" answer to "Borrowing Arrows". Every distinct
 * name in the card data still has a distinct key under this — checked when
 * this was written — so it identifies a card rather than guessing at one.
 */
export function compactKey(s: string): string {
    return s
        .normalize("NFKD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .replace(/æ/g, "ae")
        .replace(/œ/g, "oe")
        .replace(/[^a-z0-9]+/g, "");
}

export interface NameEntry {
    name: string;
    /** searchKey(name), for the add box's prefix and word-start matching. */
    key: string;
    /** `key` split into words, split once here rather than on every search. */
    words: string[];
    /** compactKey(name), for exact resolution and "did you mean". */
    compact: string;
    /** How many of each letter and digit `compact` has — see `letterGap`. */
    letters: Uint8Array;
}

interface NameIndex {
    /** Sorted A–Z, which is the order card-search lists suggestions in. */
    entries: NameEntry[];
    /** compactKey of a card's own name → that name. */
    byName: Map<string, string>;
    /**
     * compactKey of any other name the card goes by → the card's name: each
     * face of a double-faced, split or adventure card, and a printed name
     * that differs from the oracle one. Kept apart from byName so a back
     * face can never shadow a card whose own name it happens to share.
     */
    byAlias: Map<string, string>;
}

let index: NameIndex | null = null;

/** Counts of a–z and 0–9 in a compactKey. */
function letterCounts(compact: string): Uint8Array {
    const counts = new Uint8Array(36);
    for (let i = 0; i < compact.length; i++) {
        const c = compact.charCodeAt(i);
        const slot = c >= 97 ? c - 97 : c - 48 + 26;
        if (slot >= 0 && slot < 36 && counts[slot] < 255) counts[slot]++;
    }
    return counts;
}

/**
 * A cheap lower bound on edit distance: one edit changes at most two letter
 * counts by one each (a swap of neighbours changes none), so names whose
 * counts differ by more than twice the allowance can be skipped without
 * running `distance` on them. That turns away nearly every name in the index
 * for the cost of 36 subtractions.
 */
function letterGap(a: Uint8Array, b: Uint8Array): number {
    let gap = 0;
    for (let i = 0; i < 36; i++) gap += a[i] > b[i] ? a[i] - b[i] : b[i] - a[i];
    return gap;
}

function buildIndex(): NameIndex {
    const byName = new Map<string, string>();
    const byAlias = new Map<string, string>();
    const entries: NameEntry[] = [];
    for (const card of getCardData()) {
        const name: string = card.name;
        if (typeof name !== "string" || !name) continue;
        const compact = compactKey(name);
        if (!byName.has(compact)) {
            byName.set(compact, name);
            const key = searchKey(name);
            entries.push({ name, key, words: key.split(" "), compact, letters: letterCounts(compact) });
        }
        const others: unknown[] = [card.printed_name, card.arena_name];
        if (Array.isArray(card.card_faces)) {
            for (const face of card.card_faces) others.push(face?.name);
        }
        for (const other of others) {
            if (typeof other !== "string" || !other) continue;
            const k = compactKey(other);
            if (k && !byAlias.has(k)) byAlias.set(k, name);
        }
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    return { entries, byName, byAlias };
}

function getIndex(): NameIndex {
    if (!index) index = buildIndex();
    return index;
}

/** Every distinct card name, A–Z, built once per process. */
export function cardNameEntries(): readonly NameEntry[] {
    return getIndex().entries;
}

/** Exact, alias or face match on one spelling, or null. */
function exact(text: string): string | null {
    const { byName, byAlias } = getIndex();
    const k = compactKey(text);
    if (!k) return null;
    return byName.get(k) ?? byAlias.get(k) ?? null;
}

/**
 * The official name of the card `input` means, or null when it isn't one.
 *
 * In order:
 *   1. The whole text, as a card's name or one of its faces — the text as
 *      given, then with a trailing printing marker taken off ("(M10) 146",
 *      "[M10]", "*F*", the same cleanName a paste goes through). Whole first
 *      because "SP//dr, Piloted by Peni" is a real name with "//" in it.
 *   2. For "A // B", the FRONT side only. "Fable of the Mirror-Breaker //
 *      Reflection of Kiki-Jiki" is Fable, but "Fake Name // Opt" is not Opt:
 *      a real card is written front-first, so a back side on its own after
 *      something unrecognised is not evidence of anything. (A back face typed
 *      alone, "Reflection of Kiki-Jiki", is still found in step 1.)
 *   3. lib/serverAliasMap, the Pack Planner's Arena aliases, via lookupCard
 *      — but only when the alias map has an entry for exactly this name.
 *
 * Deliberately NOT a bare lookupCard fallback. Its normalizeName strips
 * standalone numbers and everything after "//", which is right for matching
 * deck lines against each other and wrong for deciding what is a card: "sp"
 * came back as "SP//dr, Piloted by Peni", and "Opt 2023" or "Shock 4" as Opt
 * and Shock. Those are refused here — neither is a card's name, and a
 * collector number belongs in "(SET) 123" form, which step 1 handles.
 *
 * Nothing fuzzy happens here either. A near miss is null and gets
 * suggestions from suggestCardNames instead — guessing would put a card in
 * someone's collection that they never asked for.
 */
export async function resolveCardName(input: string): Promise<string | null> {
    const text = input.replace(/\s+/g, " ").trim();
    if (!text) return null;
    const cleaned = cleanName(text);

    const whole = exact(text) ?? exact(cleaned);
    if (whole) return whole;

    if (cleaned.includes("//")) return exact(cleaned.split("//")[0]);

    // The alias map is keyed by normalizeName, which drops standalone numbers
    // and "//" tails — so "Stomp 4" would key as "stomp" and come back as
    // Bonecrusher Giant. Only consult it when normalizeName threw nothing
    // away but punctuation and spacing (its key and the text agree letter for
    // letter), so a hit means the alias map named exactly what was typed.
    const aliasKey = normalizeName(cleaned);
    if (!aliasKey || compactKey(aliasKey) !== compactKey(cleaned)) return null;
    if (!Object.prototype.hasOwnProperty.call(serverAliasMap, aliasKey)) return null;
    const card = await lookupCard(cleaned, false);
    if (card.failed || typeof card.name !== "string") return null;
    // Back to the index's spelling, which is the one every other answer
    // uses; card.name normally already is it.
    return exact(card.name) ?? card.name;
}

/**
 * Three reusable rows for `distance`, grown as needed — allocating fresh ones
 * for each of ~30,000 names per suggestion was most of its cost.
 */
const rows: Int32Array[] = [new Int32Array(64), new Int32Array(64), new Int32Array(64)];

/**
 * Edit distance between `a` and `b` (adjacent swaps count as one edit, the
 * typo people make most), or `max + 1` as soon as it must exceed `max`. The
 * early exit is what keeps a pass over ~30,000 names fast: almost every name
 * is abandoned within its first few rows.
 */
function distance(a: string, b: string, max: number): number {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    const n = b.length;
    if (rows[0].length <= n) {
        for (let r = 0; r < 3; r++) rows[r] = new Int32Array(n * 2 + 1);
    }
    let [prev2, prev, cur] = rows;
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
        cur[0] = i;
        let rowMin = i;
        for (let j = 1; j <= n; j++) {
            const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
            let v = prev[j] + 1;
            if (cur[j - 1] + 1 < v) v = cur[j - 1] + 1;
            if (prev[j - 1] + cost < v) v = prev[j - 1] + cost;
            if (
                i > 1 &&
                j > 1 &&
                prev2[j - 2] + 1 < v &&
                a.charCodeAt(i - 1) === b.charCodeAt(j - 2) &&
                a.charCodeAt(i - 2) === b.charCodeAt(j - 1)
            ) {
                v = prev2[j - 2] + 1;
            }
            cur[j] = v;
            if (v < rowMin) rowMin = v;
        }
        if (rowMin > max) return max + 1;
        [prev2, prev, cur] = [prev, cur, prev2];
    }
    return prev[n];
}

/**
 * Up to `limit` real names close to `input`, best first, for "Did you mean".
 *
 * Spelling first: names within a few edits of what was typed, the allowance
 * growing with the length of the name ("Lightnig Bolt" is one edit from
 * Lightning Bolt). If that leaves room, the add box's own matching fills it —
 * names where every typed word starts a word of the name, then names that
 * contain the text — so a fragment like "bolt" still gets somewhere useful.
 */
export function suggestCardNames(input: string, limit = 3): string[] {
    const c = compactKey(input);
    if (c.length < 2) return [];
    const max = Math.max(1, Math.min(4, Math.floor(c.length / 4)));

    const close: { name: string; d: number }[] = [];
    const { entries } = getIndex();
    const letters = letterCounts(c);
    for (const e of entries) {
        if (Math.abs(e.compact.length - c.length) > max || letterGap(letters, e.letters) > max * 2) continue;
        const d = distance(c, e.compact, max);
        if (d <= max) close.push({ name: e.name, d });
    }
    close.sort(
        (x, y) =>
            x.d - y.d ||
            Math.abs(x.name.length - input.length) - Math.abs(y.name.length - input.length) ||
            x.name.localeCompare(y.name)
    );
    const out = close.slice(0, limit).map((x) => x.name);
    if (out.length >= limit) return out;

    const key = searchKey(input);
    if (key.length < 2) return out;
    const typed = key.split(" ");
    const wordStarts: string[] = [];
    const contains: string[] = [];
    // Every match below contains the longest typed word somewhere in its
    // key, so one substring test turns away nearly every name before the
    // per-word checks run.
    const longest = typed.reduce((x, y) => (y.length > x.length ? y : x), "");
    for (const e of entries) {
        if (!e.key.includes(longest) || out.includes(e.name)) continue;
        if (typed.every((t) => e.words.some((w) => w.startsWith(t)))) wordStarts.push(e.name);
        else if (contains.length < limit && e.key.includes(key)) contains.push(e.name);
        if (wordStarts.length >= limit) break;
    }
    return [...out, ...wordStarts, ...contains].slice(0, limit);
}
