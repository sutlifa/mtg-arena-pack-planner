// lib/deckEdit.ts

import { totalCards, type DeckCard, type DeckSections } from "./deckSections";
import { MAX_LINE_QTY, formatDeck } from "./deckText";

/**
 * Card-by-card edits to a split deck, for the Decks page's list editor.
 *
 * The editor never keeps a second copy of the deck. A saved deck is text
 * (lib/decks, normalised by lib/deckText), and everything downstream — the
 * draft in localStorage, the leave-guard's "unsaved" check against the
 * stored text, Save, and the hand-offs to Deck Check and the Sideboard
 * Planner — already reads that text. So each edit here takes the sections
 * the text splits into, returns new ones, and the page writes them straight
 * back as text with `deckToText`. A structured copy alongside the text would
 * be one more thing to keep in step, and the first place the two disagreed
 * would be a deck that saves differently from how it looks.
 *
 * Every function is pure and returns new arrays; the input is never touched,
 * because it is React state.
 */

export type Section = "maindeck" | "sideboard";

export const OTHER_SECTION: Record<Section, Section> = { maindeck: "sideboard", sideboard: "maindeck" };

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function clamp(qty: number): number {
    return Math.min(MAX_LINE_QTY, Math.max(0, Math.floor(qty)));
}

/**
 * The deck as the text the page stores. An empty deck is "", not the bare
 * "Deck" header formatDeck would write: an untouched new deck counts as
 * unsaved work once its text is non-empty (see DeckBuilder's `dirty`), so
 * removing the last card has to leave it as empty as it started.
 */
export function deckToText(sections: DeckSections): string {
    if (sections.maindeck.length === 0 && sections.sideboard.length === 0) return "";
    return formatDeck(sections);
}

/** `cards` with `qty` more of `name`, merged into an existing row (any case) or appended. */
function addTo(cards: DeckCard[], name: string, qty: number): DeckCard[] {
    const i = cards.findIndex((c) => same(c.name, name));
    if (i === -1) return qty > 0 ? [...cards, { name, qty: clamp(qty) }] : cards;
    return cards.map((c, j) => (j === i ? { ...c, qty: clamp(c.qty + qty) } : c));
}

/** Adding a card already in the section bumps its count rather than repeating the line. */
export function addCard(deck: DeckSections, section: Section, name: string, qty: number): DeckSections {
    return { ...deck, [section]: addTo(deck[section], name, qty) };
}

/** A new count for one row; 0 or less removes it, the same as the remove button. */
export function setCardQty(deck: DeckSections, section: Section, name: string, qty: number): DeckSections {
    const n = clamp(qty);
    return {
        ...deck,
        [section]:
            n === 0
                ? deck[section].filter((c) => !same(c.name, name))
                : deck[section].map((c) => (same(c.name, name) ? { ...c, qty: n } : c)),
    };
}

export function removeCard(deck: DeckSections, section: Section, name: string): DeckSections {
    return setCardQty(deck, section, name, 0);
}

/**
 * Every copy of a row to the other half of the deck, merged with what's
 * already there. All copies rather than one: "→ SB" on "4 Duress" means the
 * Duresses belong in the sideboard; moving one at a time is what the count
 * box is for once they're there.
 */
export function moveCard(deck: DeckSections, from: Section, name: string): DeckSections {
    const card = deck[from].find((c) => same(c.name, name));
    if (!card) return deck;
    const to = OTHER_SECTION[from];
    return {
        ...deck,
        [from]: deck[from].filter((c) => !same(c.name, name)),
        [to]: addTo(deck[to], card.name, card.qty),
    } as DeckSections;
}

/**
 * Names swapped for others in both halves — a typo for the card it meant,
 * or every name for its official spelling. Two spellings that turn out to be
 * one card ("Lim-Dul's Vault" and "Lim-Dûl's Vault") become one row with the
 * copies added together, in the place the first of them held.
 */
export function renameCards(deck: DeckSections, names: ReadonlyMap<string, string>): DeckSections {
    const rename = (cards: DeckCard[]) =>
        cards.reduce<DeckCard[]>((out, c) => addTo(out, names.get(c.name) ?? c.name, c.qty), []);
    return { maindeck: rename(deck.maindeck), sideboard: rename(deck.sideboard) };
}

/** Every distinct name in the deck, maindeck first, in list order. */
export function deckNames(deck: DeckSections): string[] {
    return [...new Set([...deck.maindeck, ...deck.sideboard].map((c) => c.name))];
}

/** "Main 60 · Sideboard 15", or just the maindeck while there's no sideboard. */
export function deckCountLabel(deck: DeckSections): string {
    const side = totalCards(deck.sideboard);
    return `Main ${totalCards(deck.maindeck)}${side || deck.sideboard.length ? ` · Sideboard ${side}` : ""}`;
}
