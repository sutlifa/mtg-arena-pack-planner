// lib/cardData.ts

import cards from "@/public/data/cards-min.json";
import { resolveName } from "./aliasResolver";

export type ScryfallCard = {
    id: string;
    name: string;
    set: string;
    set_name: string;
    set_type: string | null;   // Required for Commander detection
    collector_number: string;
    rarity: string;
    released_at?: string;

    image_uris?: {
        small?: string;
        normal?: string;
        large?: string;
        png?: string;
        art_crop?: string;
        border_crop?: string;
    };

    set_icon_svg_uri?: string;

    card_faces?: Array<{
        name: string;
        image_uris?: {
            small?: string;
            normal?: string;
            large?: string;
            png?: string;
            art_crop?: string;
            border_crop?: string;
        };
    }>;

    [key: string]: any;
};

export type CardMap = Record<string, ScryfallCard[]>;

let cardMap: CardMap | null = null;

/**
 * Builds a map of canonical card name → all printings.
 * Uses resolveName() to ensure Arena names collapse into printed names.
 */
export async function getCardMap(): Promise<CardMap> {
    if (cardMap) return cardMap;

    cardMap = {};

    for (const card of cards as ScryfallCard[]) {
        // Normalize + alias → canonical printed name
        const canonical = resolveName(card.name.toLowerCase());

        if (!cardMap[canonical]) {
            cardMap[canonical] = [];
        }

        cardMap[canonical].push(card);
    }

    return cardMap;
}