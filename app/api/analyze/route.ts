// app/api/analyze/route.ts

import { NextResponse } from "next/server";
import { parseDecklist } from "@/lib/deckParser";
import { parseArenaCollection } from "@/lib/collectionParser";
import { lookupCard } from "@/lib/scryfall";
import { rankSets } from "@/lib/setRecommender";

export async function POST(req: Request) {
    try {
        const { decklist, collection, arenaMode } = await req.json();

        // ⭐ Deck parsed in current mode (now returns { map, missing })
        const { map: deckMap, missing: missingDeckCards } =
            await parseDecklist(decklist, arenaMode);

        // Collection MUST use the same mode so canonical keys match
        const collectionMap = await parseArenaCollection(collection, arenaMode);

        const lookupResults: any[] = [];

        for (const [canonical, deckQty] of deckMap.entries()) {
            const owned = collectionMap.get(canonical) ?? 0;
            const needed = Math.max(0, deckQty - owned);

            const card = await lookupCard(canonical, arenaMode);

            lookupResults.push({
                card: canonical,
                needed,
                lookup: card,
            });
        }

        const neededCards = lookupResults.filter((c) => c.needed > 0);

        // ⭐ NEW: Only run set recommender in Arena Mode
        const ranked = arenaMode ? rankSets(neededCards, arenaMode) : [];

        return NextResponse.json({
            breakdown: neededCards,
            shoppingList: neededCards,
            recommendations: ranked,   // ⭐ Will be [] in Paper Mode

            // ⭐ Missing card names for UI
            missingCards: missingDeckCards,
        });

    } catch (err) {
        console.error("ANALYZE ERROR:", err);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
