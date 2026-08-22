// lib/basicLands.ts

import { normalizeName } from "./nameUtils";

// The five basic land types. They're exempt from the normal 4-copy
// deckbuilding cap (a deck can run more than 4 Plains), and — in Arena —
// they're granted for free rather than crafted, so they never cost a
// wildcard.
export const BASIC_LAND_NAMES = new Set(
    ["Plains", "Island", "Swamp", "Mountain", "Forest"].map(normalizeName)
);
