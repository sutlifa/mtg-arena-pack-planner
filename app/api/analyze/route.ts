// app/api/analyze/route.ts
import { NextResponse } from "next/server";
import { parseDecklist } from "../../../lib/deckParser";;
import { parseArenaCollection } from "@/lib/collectionParser";
import { lookupCard } from "@/lib/scryfall";
import { computeNeededCopies } from "@/lib/arenaLogic";
import { rankSets } from "@/lib/setRecommender";
import { resolveNameServer } from "../../../lib/serverAliasMap";
import { normalizeName } from "@/lib/nameUtils";   // ⭐ REQUIRED

export const runtime = "nodejs";

// ---------------------------------------------
// Concurrency limiter (keeps Vercel happy)
// ---------------------------------------------
async function runWithLimit<T, R>(
    limit: number,
    items: T[],
    fn: (item: T) => Promise<R>
): Promise<R[]> {
    const results: R[] = [];
    const executing: Promise<void>[] = [];

    for (const item of items) {
        const p = fn(item).then((res) => {
            results.push(res);
        });

        executing.push(p);

        if (executing.length >= limit) {
            await Promise.race(executing);
            executing.splice(executing.indexOf(p), 1);
        }
    }

    await Promise.all(executing);
    return results;
}

export async function POST(req: Request) {
    try {
        const { decks, collection, disableArena } = await req.json();

        // ---------------------------------------------
        // 1. UNION DECKLISTS (MAX NEEDED) — CANONICALIZED
        // ---------------------------------------------
        const deckUnion = new Map<string, number>();

        for (const deck of decks) {
            const parsed = parseDecklist(deck);

            parsed.forEach((qty, card) => {
                // ⭐ FIXED: normalize BEFORE resolveName
                const canonical = resolveNameServer(normalizeName(card));

                const currentMax = deckUnion.get(canonical) ?? 0;
                if (qty > currentMax) deckUnion.set(canonical, qty);
            });
        }

        // Debug deck union BEFORE arena logic
        console.log("DECK UNION:", [...deckUnion.entries()]);

        // ---------------------------------------------
        // 2. ARENA MODE vs PAPER MODE
        // ---------------------------------------------
        let neededMap: Map<string, number>;

        if (disableArena) {
            neededMap = deckUnion;
        } else {
            const parsedCollection = parseArenaCollection(collection || "");

            // Debug collection map
            console.log("COLLECTION MAP:", [...parsedCollection.entries()]);

            neededMap = computeNeededCopies(deckUnion, parsedCollection);
        }

        // Debug needed map AFTER arena logic
        console.log("NEEDED MAP:", [...neededMap.entries()]);

        // ---------------------------------------------
        // 3. LOOKUP CARD DATA (LOCAL BULK → API)
        // ---------------------------------------------
        const cardEntries = Array.from(neededMap.entries()).filter(
            ([_, needed]) => needed > 0
        );

        const lookupResults = await runWithLimit(
            6,
            cardEntries,
            async ([card, needed]) => {
                // ⭐ FIXED: normalize BEFORE resolveName
                const canonical = resolveNameServer(normalizeName(card));

                const lookup = await lookupCard(canonical, !disableArena);
                return { card: canonical, needed, lookup };
            }
        );

        // ---------------------------------------------
        // 4. SET RECOMMENDATIONS
        // ---------------------------------------------
        const setRankings = await rankSets(lookupResults);

        // ---------------------------------------------
        // 5. RETURN EVERYTHING
        // ---------------------------------------------
        return NextResponse.json({
            breakdown: lookupResults,
            shoppingList: lookupResults,
            recommendations: setRankings,
        });
    } catch (err: any) {
        console.error("ANALYZE ERROR:", err);
        return NextResponse.json(
            { error: "Server Error: " + String(err) },
            { status: 500 }
        );
    }
}