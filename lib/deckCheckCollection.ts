// lib/deckCheckCollection.ts

/**
 * Which collection Deck Check is comparing against, and where it came from.
 *
 * There are three places a collection can come from, and the page has to say
 * which one is in use at all times — "no collection" and "the wrong
 * collection" both produce a confident, wrong answer:
 *
 * - "local": the Collection page's collection, kept in localStorage under
 *   COLLECTION_KEY (lib/openCollection). The default. Deck Check only reads
 *   it; editing it is the Collection page's job.
 * - "saved": one of your saved collections, loaded by id. Read-only here too.
 * - "pasted": a collection typed or pasted into Deck Check itself, or the one
 *   a saved comparison carried. The only kind Deck Check edits.
 *
 * Loading a saved collection or pasting one here deliberately does NOT
 * replace the Collection page's collection. When this tool was the Pack
 * Planner its collection box *was* the shared one, so loading "Paper binder"
 * to cost one paper deck silently swapped out the Arena collection someone
 * had spent an evening building on the Collection page. Keeping them apart is
 * what makes "Use my Collection page collection" a real choice.
 *
 * A non-local choice is kept in sessionStorage, not localStorage: it survives
 * a reload and the round trip through sign-in, but belongs to the one tab and
 * goes when the tab closes. It is a working choice for a comparison, not a
 * second collection to keep in sync with the first — that is what saving it
 * to your profile is for. Nothing is stored for "local", whose text already
 * lives under COLLECTION_KEY.
 *
 * Pure: the component does the storage calls, as with lib/openCollection.
 */

export const DECK_CHECK_COLLECTION_KEY = "mtgpp:deck-check-collection";

/**
 * A choice other than the default. "local" has no entry: Deck Check holds
 * `null` for it, because its text and mode live in the Collection page's
 * storage, not here.
 */
export type CollectionSource =
    | { kind: "saved"; id: number; name: string; /** The row's own Arena/Paper type. */ arena: boolean }
    | { kind: "pasted"; /** The saved comparison it came with, if any. */ from: string | null };

export interface DeckCheckCollection {
    source: CollectionSource;
    text: string;
    /**
     * The mode Deck Check is comparing in. Starts as the collection's own
     * type and follows the Arena/Paper switch after that, so a reload keeps
     * the mode as well as the collection.
     */
    arena: boolean;
}

/** The sessionStorage value for a choice, or null when there's nothing worth keeping. */
export function encodeDeckCheckCollection(c: DeckCheckCollection): string | null {
    // An empty paste is the same as no choice made: the page shows the empty
    // box either way, and storing it would only resurrect an empty box.
    if (c.source.kind === "pasted" && !c.text.trim()) return null;
    return JSON.stringify(c);
}

/** The stored choice, if well-formed; else null, which means "local". */
export function decodeDeckCheckCollection(raw: string | null): DeckCheckCollection | null {
    if (!raw) return null;
    try {
        const v = JSON.parse(raw);
        if (typeof v?.text !== "string" || typeof v?.arena !== "boolean") return null;
        const s = v.source;
        if (
            s?.kind === "saved" &&
            typeof s.id === "number" &&
            typeof s.name === "string" &&
            typeof s.arena === "boolean"
        ) {
            return {
                source: { kind: "saved", id: s.id, name: s.name, arena: s.arena },
                text: v.text,
                arena: v.arena,
            };
        }
        if (s?.kind === "pasted" && v.text.trim()) {
            return {
                source: { kind: "pasted", from: typeof s.from === "string" ? s.from : null },
                text: v.text,
                arena: v.arena,
            };
        }
        return null;
    } catch {
        return null;
    }
}
