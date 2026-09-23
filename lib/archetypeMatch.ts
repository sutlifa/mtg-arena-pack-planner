// lib/archetypeMatch.ts

/**
 * Finds the MTGGoldfish archetype a matchup is talking about, so the
 * Sideboard Planner can show that archetype's list without anyone pasting a
 * link.
 *
 * It always answers with its closest guess when there is anything to guess
 * from: a list to compare against that might be the wrong one is one click
 * from fixed (the planner's list picker), while an empty panel just makes
 * people go and look for a link themselves.
 *
 * Closeness, in order:
 *  1. The same name, ignoring case and punctuation.
 *  2. How many of the matchup's words the archetype's name contains. People's
 *     names drift from MTGGoldfish's — "Jeskai or 4c Control" for what
 *     Goldfish splits into "4c Control" and "Jeskai Control", "Mono Green
 *     Landfall" without the hyphen, plain "Landfall".
 *  3. When only some of the words match, how alike the names are letter by
 *     letter: "Izzet Spells" is nearer "Izzet Spellementals" than "Izzet
 *     Prowess", "Boros Dragon" is "Boros Dragons", and a misspelling that
 *     shares no whole word ("Spelementals") still lands somewhere sensible.
 *  4. The more-played deck, among those that are as close or nearly so.
 *     When every word already matches — "Landfall" against three Landfall
 *     decks — the shortest name isn't the closest in any useful sense; the
 *     most popular one is the likelier opponent and the more representative
 *     list.
 *
 * Pure, no React or Next imports.
 */

export interface MatchCandidate {
    name: string;
    pct: number | null;
    url?: string | null;
}

/** Words that join names rather than identify a deck. */
const FILLER = new Set(["or", "and", "the", "a", "deck", "vs"]);

function words(name: string): string[] {
    return name
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w && !FILLER.has(w));
}

/** How much closer by letters one name must be to beat a more-played deck. */
const NEAR_TIE = 0.15;

const squash = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Dice coefficient over letter pairs: 1 for the same string, 0 for nothing shared. */
function likeness(a: string, b: string): number {
    const x = squash(a);
    const y = squash(b);
    if (x === y) return 1;
    if (x.length < 2 || y.length < 2) return 0;

    const pairs = new Map<string, number>();
    for (let i = 0; i < x.length - 1; i++) {
        const p = x.slice(i, i + 2);
        pairs.set(p, (pairs.get(p) ?? 0) + 1);
    }
    let shared = 0;
    for (let i = 0; i < y.length - 1; i++) {
        const p = y.slice(i, i + 2);
        const n = pairs.get(p) ?? 0;
        if (n > 0) {
            shared++;
            pairs.set(p, n - 1);
        }
    }
    return (2 * shared) / (x.length - 1 + (y.length - 1));
}

export function matchArchetype<T extends MatchCandidate>(
    name: string,
    candidates: readonly T[]
): T | null {
    const withUrl = candidates.filter((c) => c.url);
    if (!name.trim() || withUrl.length === 0) return null;

    const exact = withUrl.find((c) => squash(c.name) === squash(name));
    if (exact) return exact;

    const mine = new Set(words(name));

    const scored = withUrl.map((c) => {
        let shared = 0;
        for (const w of new Set(words(c.name))) if (mine.has(w)) shared++;
        const coverage = mine.size ? shared / mine.size : 0;
        // Whole words dominate; letters only rank partial matches. Weighted
        // so no amount of letter-likeness outranks one more shared word.
        return { c, score: coverage * 10 + (coverage === 1 ? 0 : likeness(name, c.name)) };
    });
    const top = Math.max(...scored.map((s) => s.score));

    // Near-equal closeness is a tie, and ties go to the more-played deck.
    // "Jeskai or 4c Control" is a hair closer to "Jeskai Control" by letters,
    // but it names both, and 4c Control is the one you'll actually face.
    let best: T | null = null;
    for (const { c, score } of scored) {
        if (top - score > NEAR_TIE) continue;
        if (!best || (c.pct ?? 0) > (best.pct ?? 0)) best = c;
    }
    return best;
}
