// lib/scryfall.ts

import fs from "fs";
import path from "path";
import { normalizeName } from "./nameUtils";
import { serverAliasMap } from "./serverAliasMap";

let cardData: any[] = [];
let cardMap: Record<string, any> = {};
let loaded = false;

async function loadData() {
    if (loaded) return;

    const filePath = path.join(process.cwd(), "lib/data/cards-min.json");
    const fileContents = fs.readFileSync(filePath, "utf8");
    cardData = JSON.parse(fileContents);

    for (const card of cardData) {
        const key = normalizeName(card.printed_name ?? card.name);
        cardMap[key] = card;
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

    const card = cardMap[lookupKey];
    if (!card) {
        return { failed: true };
    }

    const displayName = card.printed_name ?? card.name;

    return {
        failed: false,
        name: card.name,
        printed_name: displayName,
        arena_name: card.arena_name ?? null,

        // FULL Scryfall metadata
        image_uris: card.image_uris ?? null,
        set: card.set ?? null,
        set_name: card.set_name ?? null,
        collector_number: card.collector_number ?? null,
        set_icon_svg_uri: card.set_icon_svg_uri ?? null,
        rarity: card.rarity ?? null,

        raw: card
    };
}