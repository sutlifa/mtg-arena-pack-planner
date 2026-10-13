// lib/deckShortfall.ts

import { applyVerdicts, cardKey, mergeCards, type CollectionCard, type NameVerdict } from "./collectionText";
import { deckSections, NO_CARDS_MESSAGE } from "./deckText";
import { totalCards } from "./deckSections";
import { BASIC_LAND_NAMES } from "./basicLands";
import { normalizeName } from "./nameUtils";
import { checkDecklistSize } from "./inputLimits";

/**
 * One deck against one collection, card by card: what it needs, what you
 * own, and what you're short.
 *
 * This used to live inside the Collection page's "Compare with a deck" panel.
 * It moved here when that comparison moved to Deck Check, which runs it for
 * every deck slot after an analysis — the per-deck answer next to the
 * combined breakdown /api/analyze produces.
 *
 * Why it is computed in the browser rather than by /api/analyze: the analysis
 * merges every deck into one need (the larger count of each card, or the sum),
 * and caps Arena counts at four. "What is *this* deck missing" wants neither —
 * it is the 75 as written against the cards you hold — and the inputs are
 * already on the page, so a second server round trip would buy nothing.
 *
 * The rules, unchanged from the panel it came from:
 *
 * - Maindeck and sideboard are added together: you need every card in the 75
 *   to play the deck.
 * - Basic lands are left out of the shortfall — Arena grants them free, and
 *   nobody tracks paper basics in a collection — but are still listed, so the
 *   deck's numbers add up.
 * - Names are matched by cardKey (the same key the collection merges
 *   printings on), after the deck's names have been put through
 *   /api/card-resolve by the caller. A deck typed with "Lim-Dul's Vault" and a
 *   collection holding "Lim-Dûl's Vault" are one card; without resolving both
 *   sides to the same spelling the card would read as missing while it sits
 *   in the binder.
 *
 * Pure: the component does the network calls, this only decides.
 */

/** One card the deck asks for, under the name the collection would use. */
export interface DeckNeed {
    name: string;
    qty: number;
    basic: boolean;
    /** False when the server says it isn't a card; null when it couldn't be asked. */
    recognised: boolean | null;
}

/** A need with the collection's answer beside it. */
export interface ShortfallLine extends DeckNeed {
    own: number;
    /** Copies still to get. Always 0 for a basic land. */
    short: number;
}

export type ParsedDeck =
    | { ok: true; main: number; side: number; cards: CollectionCard[] }
    | { ok: false; error: string };

const isBasic = (name: string) => BASIC_LAND_NAMES.has(normalizeName(name));

/** The 75 as one list, copies of a card across both halves added. */
export function parseDeckForShortfall(text: string): ParsedDeck {
    const trimmed = text.trim();
    if (!trimmed) return { ok: false, error: "This slot is empty." };

    const sizeError = checkDecklistSize(trimmed);
    if (sizeError) return { ok: false, error: sizeError };

    const { maindeck, sideboard } = deckSections(trimmed);
    if (maindeck.length === 0 && sideboard.length === 0) {
        return { ok: false, error: NO_CARDS_MESSAGE };
    }
    return {
        ok: true,
        main: totalCards(maindeck),
        side: totalCards(sideboard),
        cards: mergeCards([...maindeck, ...sideboard]),
    };
}

/** Needs whose names the server has checked, merged where two spellings were one card. */
export function needsFromVerdicts(
    cards: readonly CollectionCard[],
    verdicts: ReadonlyMap<string, NameVerdict>
): DeckNeed[] {
    const { cards: resolved, unknown } = applyVerdicts(cards, verdicts);
    const notCards = new Set(unknown);
    return resolved.map((c) => ({
        name: c.name,
        qty: c.qty,
        basic: isBasic(c.name),
        recognised: !notCards.has(c.name),
    }));
}

/**
 * Needs compared as typed, for when the names couldn't be checked. Still
 * worth an answer — most names are spelled the way the collection spells
 * them — and the view says it couldn't check.
 */
export function uncheckedNeeds(cards: readonly CollectionCard[]): DeckNeed[] {
    return cards.map((c) => ({ name: c.name, qty: c.qty, basic: isBasic(c.name), recognised: null }));
}

/** Copies owned per cardKey. */
export function ownedCounts(collection: readonly CollectionCard[]): Map<string, number> {
    const m = new Map<string, number>();
    for (const c of collection) m.set(cardKey(c.name), (m.get(cardKey(c.name)) ?? 0) + c.qty);
    return m;
}

export interface Shortfall {
    /** Every card, most-missing first. */
    lines: ShortfallLine[];
    missing: ShortfallLine[];
    totalMissing: number;
    basicCopies: number;
    notCards: ShortfallLine[];
    /** "qty name" per missing card — pastes into Arena's import or TCGPlayer's mass entry. */
    missingText: string;
}

export function shortfall(needs: readonly DeckNeed[], owned: ReadonlyMap<string, number>): Shortfall {
    const lines = needs
        .map((n) => {
            const own = owned.get(cardKey(n.name)) ?? 0;
            return { ...n, own, short: n.basic ? 0 : Math.max(0, n.qty - own) };
        })
        .sort((a, b) => b.short - a.short || a.name.localeCompare(b.name));
    const missing = lines.filter((l) => l.short > 0);
    return {
        lines,
        missing,
        totalMissing: missing.reduce((n, l) => n + l.short, 0),
        basicCopies: lines.filter((l) => l.basic).reduce((n, l) => n + l.qty, 0),
        notCards: lines.filter((l) => l.recognised === false),
        missingText: missing.map((l) => `${l.short} ${l.name}`).join("\n"),
    };
}
