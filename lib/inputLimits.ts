// lib/inputLimits.ts

/**
 * Size limits for the public, unauthenticated API routes.
 *
 * Both /api/analyze and /api/rotation loop per line and do a lookup for each
 * one, with no bound of their own. The platform caps request bodies at a few
 * megabytes, but that still leaves room for millions of lines of work per
 * request — and there's no rate limiting in front of these routes.
 *
 * The numbers below are set far above any realistic use so nothing legitimate
 * breaks: a Commander deck is ~100 lines, and a full Arena collection export
 * is on the order of ten thousand. They exist purely to stop a single request
 * from consuming unbounded CPU.
 */

export const MAX_DECKS = 20;
export const MAX_DECK_LINES = 2_000;
export const MAX_DECK_CHARS = 200_000;

export const MAX_COLLECTION_LINES = 100_000;
export const MAX_COLLECTION_CHARS = 5_000_000;

export interface LimitError {
    error: string;
}

function countLines(text: string): number {
    // +1 because a string with no newline is still one line.
    let n = 1;
    for (let i = 0; i < text.length; i++) {
        if (text.charCodeAt(i) === 10) n++;
    }
    return n;
}

/**
 * Validates the decklist field, which may be a single string or an array of
 * them. Returns null when the input is acceptable, or a message describing
 * the limit that was exceeded.
 */
export function checkDecklistSize(decklist: unknown): string | null {
    const decks: string[] = Array.isArray(decklist)
        ? decklist.filter((d): d is string => typeof d === "string")
        : typeof decklist === "string"
            ? [decklist]
            : [];

    if (decks.length > MAX_DECKS) {
        return `Too many decks — the limit is ${MAX_DECKS}.`;
    }

    for (const deck of decks) {
        if (deck.length > MAX_DECK_CHARS) {
            return `That decklist is too large — the limit is ${MAX_DECK_CHARS.toLocaleString()} characters.`;
        }
        if (countLines(deck) > MAX_DECK_LINES) {
            return `That decklist has too many lines — the limit is ${MAX_DECK_LINES.toLocaleString()}.`;
        }
    }

    return null;
}

/** Same idea for the (much larger) collection field. */
export function checkCollectionSize(collection: unknown): string | null {
    if (typeof collection !== "string") return null;

    if (collection.length > MAX_COLLECTION_CHARS) {
        return `That collection is too large — the limit is ${MAX_COLLECTION_CHARS.toLocaleString()} characters.`;
    }
    if (countLines(collection) > MAX_COLLECTION_LINES) {
        return `That collection has too many lines — the limit is ${MAX_COLLECTION_LINES.toLocaleString()}.`;
    }

    return null;
}
