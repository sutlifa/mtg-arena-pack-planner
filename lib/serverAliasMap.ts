// lib/serverAliasMap.ts

import { normalizeName } from "./nameUtils";

/**
 * This map ensures that MDFCs, Adventures, Battles,
 * and Omenpaths multi-face cards resolve to their
 * correct *front-face* canonical identity.
 *
 * Keys and values are normalized names.
 */
export const serverAliasMap: Record<string, string> = {
    // MDFCs (examples)
    "valakut awakening": "valakut awakening",
    "valakut stoneforge": "valakut awakening",

    "bala ged recovery": "bala ged recovery",
    "bala ged sanctuary": "bala ged recovery",

    // Adventures (examples)
    "bonecrusher giant": "bonecrusher giant",
    "stomp": "bonecrusher giant",

    "brazen borrower": "brazen borrower",
    "petty theft": "brazen borrower",

    // Battles (front face)
    "invasion of zendikar": "invasion of zendikar",
    "awakened skyclave": "invasion of zendikar",

    // Omenpaths / multi-face UB cards (examples)
    "esper origins": "esper origins",
    "esper origins awakened": "esper origins",

    // Add more aliases as needed…
};

/**
 * Optional helper: Arena sometimes uses different names.
 * This function normalizes Arena names to canonical names.
 */
export function getArenaName(name: string): string {
    return normalizeName(name);
}