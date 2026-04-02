// lib/scryfall.ts

import fs from "fs";
import path from "path";
import { normalizeName } from "./nameUtils";
import { serverAliasMap } from "./serverAliasMap";

let cardData: any[] = [];
let cardMap: Record<string, any[]> = {}; // store arrays of printings
let loaded = false;

async function loadData() {
    if (loaded) return;

    const filePath = path.join(process.cwd(), "lib/data/cards-min.json");
    const fileContents = fs.readFileSync(filePath, "utf8");
    cardData = JSON.parse(fileContents);

    for (const card of cardData) {
        // ⭐ FIXED: canonical grouping MUST use oracle name
        const key = normalizeName(card.name);

        if (!cardMap[key]) cardMap[key] = [];
        cardMap[key].push(card);
    }

    loaded = true;
}

export async function lookupCard(
    name: string,
    arenaMode = false
): Promise<any> {

    await loadData();

    const normalized = normalizeName(name);
    const alias = serverAliasMap[normalized];
    const lookupKey = alias ?? normalized;

    const printings = cardMap[lookupKey];

    if (!printings || printings.length === 0) {
        return { failed: true };
    }

    // ⭐ FIXED: correct Arena vs Paper selection
    let selected;

    if (arenaMode) {
        // Prefer Arena printings
        selected =
            printings.find(c => c.games?.includes("arena")) ??
            printings[0];
    } else {
        // Prefer Paper printings
        selected =
            printings.find(c => !c.games?.includes("arena")) ??
            printings[0];
    }

    // ⭐ FIXED: printed_name is ALWAYS the correct display name
    const displayName =
        selected.printed_name ??
        selected.name;

    return {
        failed: false,

        // canonical oracle name
        name: selected.name,

        // correct printing-specific display name
        printed_name: displayName,

        // metadata
        arena_name: selected.arena_name ?? null,
        image_uris: selected.image_uris ?? null,
        set: selected.set ?? null,
        set_name: selected.set_name ?? null,
        collector_number: selected.collector_number ?? null,
        set_icon_svg_uri: selected.set_icon_svg_uri ?? null,
        rarity: selected.rarity ?? null,

        raw: selected
    };
}
