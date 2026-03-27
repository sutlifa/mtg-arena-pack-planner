import { NextResponse } from "next/server";
import { parseDecklist } from "@/lib/deckParser";
import { parseArenaCollection } from "@/lib/collectionParser";
import { lookupCard } from "@/lib/scryfall";
import { computeNeededCopies } from "@/lib/arenaLogic";
import { rankSets } from "@/lib/setRecommender";

export async function POST(req: Request) {
  try {
    const { decks, collectionText, disableArena } = await req.json();

    // Build union using max copies
    const deckUnion = new Map<string, number>();

    for (const deck of decks) {
      const parsed = parseDecklist(deck.text);
      parsed.forEach((qty, card) => {
        const currentMax = deckUnion.get(card) ?? 0;
        if (qty > currentMax) deckUnion.set(card, qty);
      });
    }

    // Arena OFF → simple list
    if (disableArena) {
      const results = [...deckUnion.entries()].map(([card, needed]) => ({
        card,
        needed,
      }));

      return NextResponse.json({
        results,
        setRankings: [],
      });
    }

    // Arena ON → full logic
    const collection = parseArenaCollection(collectionText || "");
    const neededMap = computeNeededCopies(deckUnion, collection);

    const results: any[] = [];

    for (const [card, needed] of neededMap.entries()) {
      const lookup = await lookupCard(card);
      results.push({ card, needed, lookup });
    }

    const setRankings = rankSets(results);

    return NextResponse.json({
      results,
      setRankings,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Server Error: " + String(err) },
      { status: 500 }
    );
  }
}