// lib/deckParser.ts

import { normalizeName } from "./nameUtils";
import { lookupCard } from "./scryfall";

/**
 * Extracts "3 Card Name" or "3x Card Name" or "Card Name 3"
 */
function extractQtyAndName(line: string): { qty: number; rawName: string } | null {
    let m = line.match(/^(\d+)\s+(.+)$/);
    if (m) return { qty: parseInt(m[1], 10), rawName: m[2].trim() };

    m = line.match(/^(\d+)x\s+(.+)$/i);
    if (m) return { qty: parseInt(m[1], 10), rawName: m[2].trim() };

    m = line.match(/^(.+)\s+(\d+)$/);
    if (m) return { qty: parseInt(m[2], 10), rawName: m[1].trim() };

    return null;
}

/**
 * Hardened decklist parser.
 * Sideboard header ignored, all cards included.
 *
 * ⭐ IMPORTANT:
 * When merging multiple decklists, we take the MAX quantity needed
 * across all decks (capped at 4), NOT the sum.
 *
 * Example:
 *   Deck 1: 4 Phlage
 *   Deck 2: 4 Phlage
 *   Deck 3: 4 Phlage
 *
 * Correct merged result: 4 (not 12)
 */
export async function parseDecklist(
    text: string | undefined | null,
    arenaMode = false
): Promise<Map<string, number>> {
    const finalMap = new Map<string, number>();

    if (!text || typeof text !== "string") {
        console.error("parseDecklist received invalid text:", text);
        return finalMap;
    }

    const lines = text
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

    for (const line of lines) {
        // Ignore section headers
        if (/^sideboard$/i.test(line)) continue;

        const parsed = extractQtyAndName(line);
        if (!parsed) continue;

        const { qty, rawName } = parsed;
        const normalized = normalizeName(rawName);

        let card;
        try {
            card = await lookupCard(normalized, arenaMode);
        } catch {
            continue;
        }

        if (!card || card.failed) continue;

        const canonical = normalizeName(card.name);

        // ⭐ FIX: Use MAX per deck, cap at 4 — do NOT sum across decks
        const current = finalMap.get(canonical) ?? 0;
        const newQty = Math.min(4, Math.max(current, qty));

        finalMap.set(canonical, newQty);
    }

    return finalMap;
}