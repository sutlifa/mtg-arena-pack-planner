// app/api/analyze/route.ts

import { NextResponse } from "next/server";
import { parseDecklist } from "@/lib/deckParser";
import { parseArenaCollection } from "@/lib/collectionParser";
import { lookupCard } from "@/lib/scryfall";
import { rankSets } from "@/lib/setRecommender";
import { estimateWildcards } from "@/lib/wildcardEstimator";

export async function POST(req: Request) {
    try {
        const { decklist, collection, arenaMode, mergePaperCounts, printingOverrides } = await req.json();

        // Deck parsed in current mode (Paper: max/sum; Arena: capped by parser)
        const { map: deckMap, missing: missingDeckCards } =
            await parseDecklist(decklist, arenaMode, mergePaperCounts);

        // Collection MUST use same mode so canonical keys match
        const collectionMap = await parseArenaCollection(collection, arenaMode);

        const lookupResults: any[] = [];

        for (const [canonical, deckQty] of deckMap.entries()) {
            const owned = collectionMap.get(canonical) ?? 0;

            // 🔥 Single, simple rule for all modes
            const needed = Math.max(0, deckQty - owned);

            const card = await lookupCard(canonical, arenaMode, printingOverrides?.[canonical]);

            const arenaPrinting = card?.arenaPrinting ?? null;
            const paperPrinting = card?.paperPrinting ?? null;

            lookupResults.push({
                card: canonical,
                needed,
                lookup: {
                    ...card,
                    arenaPrinting,
                    paperPrinting,
                },
            });
        }

        const neededCards = lookupResults.filter((c) => c.needed > 0);

        // Arena Mode only: compute recommendations
        const ranked = arenaMode ? rankSets(neededCards) : null;

        const response: any = {
            breakdown: neededCards,
            shoppingList: neededCards,
            missingCards: missingDeckCards,
        };

        if (arenaMode) {
            response.recommendations = ranked;
            response.wildcards = estimateWildcards(neededCards);
        }

        return NextResponse.json(response);

    } catch (err) {
        console.error("ANALYZE ERROR:", err);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
