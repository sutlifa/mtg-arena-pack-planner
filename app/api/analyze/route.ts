// app/api/analyze/route.ts

import { NextResponse } from "next/server";
import { parseDecklist } from "@/lib/deckParser";
import { parseArenaCollection } from "@/lib/collectionParser";
import { lookupCard } from "@/lib/scryfall";
import { rankSets } from "@/lib/setRecommender";
import { normalizeName } from "@/lib/nameUtils";

export async function POST(req: Request) {
    try {
        const { decklist, collection, arenaMode } = await req.json();

        // Parse decklist using arenaMode (affects lookup + display)
        const deckMap = await parseDecklist(decklist, arenaMode);

        // ⭐ Collection should ALWAYS be parsed in paper mode
        // This ensures stable canonicalization and correct matching
        const collectionMap = await parseArenaCollection(collection, false);

        const lookupResults: any[] = [];

        // Build needed list
        for (const [canonical, deckQty] of deckMap.entries()) {
            const owned = collectionMap.get(canonical) ?? 0;
            const needed = Math.max(0, deckQty - owned);

            const card = await lookupCard(canonical, arenaMode);

            lookupResults.push({
                card: canonical,
                displayName: card.printed_name ?? card.name,
                needed,
                lookup: card,
            });
        }

        // Only needed cards go into breakdown + shopping list + recommender
        const neededCards = lookupResults.filter((c) => c.needed > 0);

        // Set recommender only sees needed cards
        const ranked = rankSets(neededCards, arenaMode);

        return NextResponse.json({
            breakdown: neededCards,
            shoppingList: neededCards,
            recommendations: ranked,
        });

    } catch (err) {
        console.error("ANALYZE ERROR:", err);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}