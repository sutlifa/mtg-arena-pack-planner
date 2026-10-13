// lib/deckHandoff.ts

/**
 * Handing a deck from the Decks page to another tool without putting it in
 * the URL.
 *
 * A saved deck travels as ?deck=<id> and the receiving page fetches it. An
 * unsaved one — pasted signed out, or a saved one with edits not yet saved —
 * has no id, and the decklist itself must never go in an address: addresses
 * end up in browser history, in Vercel's request logs and in the page-view
 * analytics, none of which should hold someone's list. So the sending page
 * leaves the deck in sessionStorage under the receiving tool's key, and the
 * receiving page takes it (reads and removes it) once, on arrival.
 *
 * sessionStorage rather than localStorage: it belongs to the one tab that
 * clicked the button, so a second tab can't pick up a deck it was never sent,
 * and it disappears with the tab rather than lingering on the device. It is
 * also stamped with the time it was left, and ignored if it is more than a
 * few minutes old — a hand-off whose page never loaded (a failed navigation,
 * a closed laptop) must not surface later on an ordinary visit and replace
 * whatever the user was doing.
 *
 * Pure: the components do the storage calls; this decides what to write and
 * whether to trust what was read, the same split as lib/openCollection.
 */

/**
 * The tools a deck can be sent to. The Collection page used to be one ("what
 * am I missing?"); that comparison now lives only in Deck Check, so the
 * Collection page no longer receives decks at all.
 */
export type HandoffTarget = "deckCheck" | "sideboard";

export interface HandoffDeck {
    /** The saved row it came from, or null for an unsaved deck. */
    id: number | null;
    name: string | null;
    format: string | null;
    decklist: string;
}

export const HANDOFF_PATHS: Record<HandoffTarget, string> = {
    deckCheck: "/deck-check",
    sideboard: "/sideboard",
};

/** Long enough for a slow page load; short enough not to haunt a later visit. */
export const HANDOFF_MAX_AGE_MS = 5 * 60 * 1000;

/**
 * The sessionStorage key a target's hand-off waits under.
 *
 * Deck Check keeps the "planner" suffix it had as the Pack Planner. A hand-off
 * only lives for a few minutes, so renaming it would cost almost nothing — but
 * it would cost something for a tab that clicked "send" on the old build and
 * loaded the new one, and the key is never shown to anyone.
 */
const HANDOFF_KEY_SUFFIX: Record<HandoffTarget, string> = {
    deckCheck: "planner",
    sideboard: "sideboard",
};

export function handoffKey(target: HandoffTarget): string {
    return `mtgpp:deck-handoff:${HANDOFF_KEY_SUFFIX[target]}`;
}

export function encodeHandoff(deck: HandoffDeck, now: number): string {
    return JSON.stringify({ deck, at: now });
}

/** The deck left for this page, if it is well-formed and fresh; else null. */
export function decodeHandoff(raw: string | null, now: number): HandoffDeck | null {
    if (!raw) return null;
    try {
        const v = JSON.parse(raw);
        const d = v?.deck;
        if (
            typeof v?.at !== "number" ||
            now - v.at > HANDOFF_MAX_AGE_MS ||
            now < v.at ||
            typeof d?.decklist !== "string" ||
            !d.decklist.trim()
        ) {
            return null;
        }
        return {
            id: typeof d.id === "number" ? d.id : null,
            name: typeof d.name === "string" && d.name.trim() ? d.name : null,
            format: typeof d.format === "string" && d.format.trim() ? d.format : null,
            decklist: d.decklist,
        };
    } catch {
        return null;
    }
}
