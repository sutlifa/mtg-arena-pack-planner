// lib/cardData.ts

import fs from "fs";
import path from "path";
import { normalizeName } from "./nameUtils";

export interface ScryfallCard {
    id: string;
    name: string;
    printed_name?: string;
    arena_name?: string;
    paper_name?: string;

    set: string;
    set_name: string;
    set_type?: string;
    set_icon_svg_uri?: string;

    rarity?: string;
    digital?: boolean;
    games?: string[];

    image_uris?: { normal?: string };
    card_faces?: {
        name?: string;
        printed_name?: string;
        image_uris?: { normal?: string };
        set_icon_svg_uri?: string;
    }[];
}

let cardMapCache: Record<string, ScryfallCard[]> | null = null;

/**
 * Load cards-min.json at runtime (server-only).
 * Prevents Next.js from bundling the 139MB JSON into the client.
 */
function loadCards(): ScryfallCard[] {
    const filePath = path.join(process.cwd(), "lib/data/cards-min.json");
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
}

/**
 * Build the normalized card map.
 */
export async function getCardMap(): Promise<Record<string, ScryfallCard[]>> {
    if (cardMapCache) return cardMapCache;

    const cards = loadCards();
    const map: Record<string, ScryfallCard[]> = {};

    for (const card of cards) {
        const key = normalizeName(card.printed_name ?? card.name);
        if (!key) continue;

        if (!map[key]) map[key] = [];
        map[key].push(card);
    }

    cardMapCache = map;
    return map;
}