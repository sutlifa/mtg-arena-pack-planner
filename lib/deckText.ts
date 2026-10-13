// lib/deckText.ts

import { splitDeckSections, totalCards, type DeckCard, type DeckSections } from "./deckSections";
import { SUPPORTED_FORMATS } from "./formats";
import { checkDecklistSize } from "./inputLimits";

/**
 * A saved deck's text, and the forms the other tools want it in.
 *
 * A saved deck is stored in one normalised shape, whatever was pasted:
 *
 *     Deck
 *     4 Lightning Bolt
 *     ...
 *
 *     Sideboard
 *     2 Pyroblast
 *
 * That is Arena's own import format, so it pastes straight back into Arena,
 * and it carries explicit section markers, so lib/deckSections splits it the
 * same way every time — an MTGGoldfish download separates the halves with a
 * bare blank line instead, which only works while nothing else in the list
 * is blank. Normalising on save (rather than keeping the paste verbatim, as
 * collections do) is what lets the profile count a deck's cards in SQL and
 * lets every tool that opens it agree on which cards are the sideboard.
 *
 * Pure and dependency-free beyond other pure modules, so the Decks page runs
 * the same normalisation in the browser to show the split as you type, and
 * the API runs it again on the server, where it is the guarantee.
 */

/**
 * Formats offered when saving a deck. The Sideboard Planner's formats come
 * first (and are the only ones it acts on); the rest are formats people
 * build for on Arena or at the kitchen table, offered so a deck can be
 * labelled honestly instead of being forced into the nearest supported one.
 */
export const DECK_FORMATS: readonly { slug: string; label: string }[] = [
    ...SUPPORTED_FORMATS,
    { slug: "historic", label: "Historic" },
    { slug: "explorer", label: "Explorer" },
    { slug: "timeless", label: "Timeless" },
    { slug: "alchemy", label: "Alchemy" },
    { slug: "brawl", label: "Brawl" },
    { slug: "commander", label: "Commander" },
];

/** Longer than any real format name; a longer "format" is a paste. */
export const MAX_FORMAT_LENGTH = 40;

/**
 * Most copies of one card on one line that a saved deck keeps. Far above any
 * real list (Relentless Rats decks run a few dozen), and low enough that the
 * profile's SQL card count can never overflow an integer.
 */
const MAX_LINE_QTY = 999;

export function deckFormatLabel(slug: string | null | undefined): string {
    if (!slug) return "";
    return DECK_FORMATS.find((f) => f.slug === slug)?.label ?? slug;
}

function clampCards(cards: DeckCard[]): DeckCard[] {
    return cards
        .filter((c) => c.qty > 0)
        .map((c) => ({ name: c.name, qty: Math.min(MAX_LINE_QTY, c.qty) }));
}

/** The maindeck/sideboard split of any pasted list, with silly counts capped. */
export function deckSections(text: string): DeckSections {
    const { maindeck, sideboard } = splitDeckSections(text);
    return { maindeck: clampCards(maindeck), sideboard: clampCards(sideboard) };
}

/** The normalised text for a split deck — see the module comment. */
export function formatDeck(sections: DeckSections): string {
    const lines = ["Deck", ...sections.maindeck.map((c) => `${c.qty} ${c.name}`)];
    if (sections.sideboard.length > 0) {
        lines.push("", "Sideboard", ...sections.sideboard.map((c) => `${c.qty} ${c.name}`));
    }
    return lines.join("\n");
}

/** Any pasted list in the normalised form. Idempotent. */
export function normalizeDecklist(text: string): string {
    return formatDeck(deckSections(text));
}

export function deckCounts(text: string): { main: number; side: number } {
    const { maindeck, sideboard } = deckSections(text);
    return { main: totalCards(maindeck), side: totalCards(sideboard) };
}

/**
 * The deck as ONE Deck Check slot: every line, no blank ones.
 *
 * The analysis reads a blank line inside a slot as the start of a second deck
 * (lib/deckParser), and merges separate decks by taking the larger count of
 * each card. Handed the normalised text as-is, a card with two copies in the
 * maindeck and two in the sideboard would be costed at two, not four. With
 * the blank line gone the whole list is one deck, the "Sideboard" marker is
 * skipped, and copies across both halves add up as they should.
 */
export function plannerDeckText(text: string): string {
    return normalizeDecklist(text)
        .split("\n")
        .filter((l) => l.trim() !== "")
        .join("\n");
}

/**
 * What to say when text has no card lines in it. One string for the Decks
 * page, Deck Check's slots and per-deck view, and the API, so they all
 * explain the same problem the same way.
 */
export const NO_CARDS_MESSAGE = 'No cards found in that list — use one card per line, like "4 Lightning Bolt".';

export type DeckInput =
    | { ok: true; decklist: string; format: string | null }
    | { ok: false; status: 400 | 413; error: string };

/**
 * Validates and normalises what a client sent to save as a deck.
 *
 * Shared by POST /api/decks and PUT /api/decks/[id] so the two can't drift
 * on a limit or a message. The size check runs on the raw text, before any
 * parsing, so an oversized body costs nothing but the length check.
 */
export function readDeckInput(decklist: unknown, format: unknown): DeckInput {
    if (typeof decklist !== "string" || !decklist.trim()) {
        return { ok: false, status: 400, error: "Paste a decklist first" };
    }

    const sizeError = checkDecklistSize(decklist);
    if (sizeError) return { ok: false, status: 413, error: sizeError };

    const sections = deckSections(decklist);
    if (sections.maindeck.length === 0 && sections.sideboard.length === 0) {
        return {
            ok: false,
            status: 400,
            error: NO_CARDS_MESSAGE,
        };
    }

    let cleanFormat: string | null = null;
    if (format !== undefined && format !== null) {
        if (typeof format !== "string") {
            return { ok: false, status: 400, error: "That format isn't valid" };
        }
        const trimmed = format.trim();
        if (trimmed.length > MAX_FORMAT_LENGTH) {
            return {
                ok: false,
                status: 400,
                error: `Format is too long (max ${MAX_FORMAT_LENGTH} characters)`,
            };
        }
        cleanFormat = trimmed || null;
    }

    return { ok: true, decklist: formatDeck(sections), format: cleanFormat };
}
