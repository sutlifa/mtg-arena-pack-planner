// lib/deckLimits.ts

import fs from "fs";
import path from "path";
import { normalizeName } from "./nameUtils";

/**
 * Canonical name -> max copies allowed in a deck, for the handful of cards
 * whose own rules text overrides the normal 4-copy limit (e.g. Relentless
 * Rats, Nazgûl). null means "any number" (unlimited); a number means
 * "up to N". Cards with no such override simply aren't in this map.
 *
 * Populated once from cards-min.json's `deck_limit` field, which
 * scripts/build-cards.js derives from each card's oracle text.
 */
export const deckLimits: Record<string, number | null> = {};

(function buildDeckLimits() {
    const filePath = path.join(process.cwd(), "lib/data/cards-min.json");
    const fileContents = fs.readFileSync(filePath, "utf8");
    const cards = JSON.parse(fileContents);

    for (const card of cards) {
        if (card.deck_limit === undefined) continue;

        deckLimits[normalizeName(card.name)] = card.deck_limit;
        if (card.printed_name) {
            deckLimits[normalizeName(card.printed_name)] = card.deck_limit;
        }
    }
})();
