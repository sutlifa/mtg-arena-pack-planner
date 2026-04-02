// lib/serverAliasMap.ts

import fs from "fs";
import path from "path";
import { normalizeName } from "./nameUtils";

/**
 * Manual aliases for MDFCs, Adventures, Battles,
 * and Omenpaths multi-face cards.
 *
 * These MUST remain manual because they map
 * back-face → front-face intentionally.
 */
export const serverAliasMap: Record<string, string> = {
    // MDFCs
    "valakut awakening": "valakut awakening",
    "valakut stoneforge": "valakut awakening",

    "bala ged recovery": "bala ged recovery",
    "bala ged sanctuary": "bala ged recovery",

    // Adventures
    "bonecrusher giant": "bonecrusher giant",
    "stomp": "bonecrusher giant",

    "brazen borrower": "brazen borrower",
    "petty theft": "brazen borrower",

    // Battles
    "invasion of zendikar": "invasion of zendikar",
    "awakened skyclave": "invasion of zendikar",

    // Omenpaths multi-face
    "esper origins": "esper origins",
    "esper origins awakened": "esper origins",
};

/**
 * Auto-alias Arena/Paper dual-name cards ONLY.
 * These are single-face cards where printed_name differs.
 */
(function buildAutoAliases() {
    const filePath = path.join(process.cwd(), "lib/data/cards-min.json");
    const fileContents = fs.readFileSync(filePath, "utf8");
    const cards = JSON.parse(fileContents);

    for (const card of cards) {
        const oracle = normalizeName(card.name);
        const printed = normalizeName(card.printed_name ?? card.name);

        const isMultiFace =
            Array.isArray(card.card_faces) && card.card_faces.length > 0;

        // Skip MDFCs, Adventures, Battles, Split cards, etc.
        if (isMultiFace) continue;

        // Only alias true dual-name cards
        if (printed !== oracle) {
            // Do NOT overwrite manual aliases
            // Always alias printed_name → oracle for single-face dual-name cards
            serverAliasMap[printed] = oracle;

            
        }
    }
})();
