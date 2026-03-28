import { NextResponse } from "next/server";
import { parseDecklist } from "@/lib/deckParser";
import { parseArenaCollection } from "@/lib/collectionParser";
import { lookupCard } from "@/lib/scryfall";
import { computeNeededCopies } from "@/lib/arenaLogic";
import { rankSets } from "@/lib/setRecommender";

export const runtime = "nodejs";

// ⭐ Run async tasks with a concurrency limit
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

    // -----------------------------
    // 1. UNION DECKLISTS (MAX NEEDED)
    // -----------------------------
    const deckUnion = new Map<string, number>();

    for (const deck of decks) {
      const parsed = parseDecklist(deck);
      parsed.forEach((qty, card) => {
        const currentMax = deckUnion.get(card) ?? 0;
        if (qty > currentMax) deckUnion.set(card, qty);
      });
    }

    // -----------------------------
    // 2. ARENA MODE vs PAPER MODE
    // -----------------------------
    let neededMap: Map<string, number>;

    if (disableArena) {
      // PAPER MODE — ignore Arena collection
      neededMap = deckUnion;
    } else {
      // ARENA MODE — subtract Arena collection
      const parsedCollection = parseArenaCollection(collection || "");
      neededMap = computeNeededCopies(deckUnion, parsedCollection);
    }

    // -----------------------------
    // 3. LOOKUP SCRYFALL DATA (CONCURRENT, LIMITED)
    // -----------------------------
    const cardEntries = Array.from(neededMap.entries()).filter(
      ([_, needed]) => needed > 0
    );

    const lookupResults = await runWithLimit(
      6,
      cardEntries,
      async ([card, needed]) => {
        const lookup = await lookupCard(card);
        return { card, needed, lookup };
      }
    );

    const results = lookupResults;

    // -----------------------------
    // 4. SET RECOMMENDATIONS
    // -----------------------------
    const setRankings = await rankSets(results);

    // -----------------------------
    // 5. RETURN EVERYTHING
    // -----------------------------
    return NextResponse.json({
      breakdown: results,
      shoppingList: results,
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