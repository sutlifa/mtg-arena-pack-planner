// lib/cardDataStore.ts

import fs from "fs";
import path from "path";

/**
 * The full cards-min.json array, read from disk once and cached for the
 * lifetime of this server process. lib/scryfall.ts, lib/serverAliasMap.ts,
 * and lib/deckLimits.ts all need the same multi-MB file — reading and
 * parsing it three separate times at cold start would triple that cost for
 * no reason, so they all pull from here instead.
 */
let cache: any[] | null = null;

export function getCardData(): any[] {
    if (!cache) {
        const filePath = path.join(process.cwd(), "lib/data/cards-min.json");
        const fileContents = fs.readFileSync(filePath, "utf8");
        const parsed: any[] = JSON.parse(fileContents);
        cache = parsed;
    }
    return cache;
}
