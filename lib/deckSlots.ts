// lib/deckSlots.ts

import { plannerDeckText } from "./deckText";
import { MAX_DECKS, MAX_DECK_CHARS } from "./inputLimits";

/**
 * Deck Check's deck slots: each one either a saved deck from the Decks tab or
 * a list pasted straight in.
 *
 * The slot has to know which it is, and whether a saved one has been edited
 * since it was loaded, for two reasons. The page shows it — a slot that reads
 * "Mono-Red Aggro" while holding someone's half-finished edits would be
 * claiming a deck it no longer is. And saving depends on it: a pasted slot
 * offers "Save to Decks"; an edited saved slot offers "Save changes to deck"
 * (overwriting that deck, only on that explicit click) or "Save as new deck";
 * an unedited saved slot has nothing to save.
 *
 * The slots are kept in sessionStorage (encodeSlots / decodeSlots) so they
 * survive a reload and — the reason it exists — the full-page trip through
 * sign-in. The sign-in prompts on Deck Check are ordinary links, and before
 * this the slots lived only in component state, so signing in to save a
 * pasted deck threw that deck away while the pasted collection (already in
 * sessionStorage, lib/deckCheckCollection) survived. sessionStorage rather
 * than localStorage for the same reasons as the collection choice: it is this
 * tab's work in progress, not something to resurface in a week.
 *
 * Pure: the components hold the state and do the storage calls; this only
 * answers questions about it and decides what to write and trust.
 */

export const DECK_CHECK_SLOTS_KEY = "mtgpp:deck-check-slots";

/** The saved deck a slot was loaded from. */
export interface LinkedDeck {
    id: number;
    name: string;
    format: string | null;
    /**
     * The stored list in slot form (plannerDeckText), which "edited" is
     * measured against. Null when the deck arrived already differing from
     * what's stored — sent from the Decks page with unsaved edits — so it
     * reads as edited from the start, which is the truth.
     */
    baseline: string | null;
}

export interface DeckSlot {
    /** Stable across edits, adds and removes — React's key, never shown. */
    key: number;
    text: string;
    saved: LinkedDeck | null;
}

/** A slot holding a saved deck exactly as stored. */
export function slotFromSaved(
    key: number,
    deck: { id: number; name: string; format: string | null; decklist: string }
): DeckSlot {
    const text = plannerDeckText(deck.decklist);
    return { key, text, saved: { id: deck.id, name: deck.name, format: deck.format, baseline: text } };
}

/**
 * Whether a saved slot's text has moved away from the stored deck.
 *
 * Compared in normal form, so retyping a line the way it already was, or
 * pasting the same list with a blank line in a different place, isn't an
 * edit. A pasted slot is never "edited" — there is nothing to differ from.
 */
export function isEdited(slot: DeckSlot): boolean {
    if (!slot.saved) return false;
    if (slot.saved.baseline === null) return true;
    return plannerDeckText(slot.text) !== slot.saved.baseline;
}

/** A slot as stored: everything but the key, which is only React's. */
export type StoredSlot = Omit<DeckSlot, "key">;

/**
 * The sessionStorage value for these slots, or null when there is nothing
 * worth keeping (every slot empty and unlinked — the state Start Over leaves,
 * so Start Over clears the stored copy just by happening).
 *
 * Bounded by the analysis's own limits: no more slots than /api/analyze
 * accepts decks, and no slot longer than it accepts a decklist. Past either,
 * nothing is stored — a reload then loses the over-limit work, which the
 * analysis would refuse anyway, rather than storing a fragment of it.
 */
export function encodeSlots(slots: readonly DeckSlot[]): string | null {
    if (!slots.some((s) => s.text.trim() || s.saved)) return null;
    if (slots.length > MAX_DECKS || slots.some((s) => s.text.length > MAX_DECK_CHARS)) return null;
    const stored: StoredSlot[] = slots.map((s) => ({ text: s.text, saved: s.saved }));
    return JSON.stringify(stored);
}

/** The stored slots, if well-formed; else null, which means "start with one empty slot". */
export function decodeSlots(raw: string | null): StoredSlot[] | null {
    if (!raw) return null;
    try {
        const v = JSON.parse(raw);
        if (!Array.isArray(v) || v.length === 0 || v.length > MAX_DECKS) return null;
        const out: StoredSlot[] = [];
        for (const item of v) {
            if (typeof item?.text !== "string") return null;
            const s = item.saved;
            const saved: LinkedDeck | null =
                s && typeof s.id === "number" && typeof s.name === "string"
                    ? {
                          id: s.id,
                          name: s.name,
                          format: typeof s.format === "string" ? s.format : null,
                          // Missing or malformed reads as "differs from the
                          // stored deck", which at worst offers a save that
                          // isn't needed — never hides one that is.
                          baseline: typeof s.baseline === "string" ? s.baseline : null,
                      }
                    : null;
            out.push({ text: item.text, saved });
        }
        return out;
    } catch {
        return null;
    }
}
