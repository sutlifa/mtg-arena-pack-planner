// app/api/analyze/route.ts

import { NextResponse } from "next/server";
import { parseDecklist } from "@/lib/deckParser";
import { parseArenaCollection } from "@/lib/collectionParser";
import { tidyCollection } from "@/lib/collectionText";
import { lookupCard } from "@/lib/scryfall";
import { rankSets } from "@/lib/setRecommender";
import { estimateWildcards } from "@/lib/wildcardEstimator";
import { checkDecklistSize, checkCollectionSize } from "@/lib/inputLimits";
import { readJsonBody } from "@/lib/requestBody";

export async function POST(req: Request) {
    try {
        // A body that is not JSON is bad input, not a server fault — parse it
        // before the try block's catch can turn a SyntaxError into a 500.
        const body = await readJsonBody(req);
        if (!body) {
            return NextResponse.json(
                { error: "That request could not be read — expected a JSON body." },
                { status: 400 }
            );
        }

        const { decklist, collection, arenaMode, mergePaperCounts, printingOverrides } = body;

        // Bound the work before doing any of it — this route is public and
        // unauthenticated, and parsing is per-line with no internal limit.
        const sizeError = checkDecklistSize(decklist) ?? checkCollectionSize(collection);
        if (sizeError) {
            return NextResponse.json({ error: sizeError }, { status: 413 });
        }

        // Deck parsed in current mode (Paper: max/sum; Arena: capped by parser)
        const { map: deckMap, missing: missingDeckCards } =
            await parseDecklist(decklist, arenaMode, mergePaperCounts);

        // Copies of one card merged into one line before anything reads the
        // collection, whichever page or tool sent it. That's the rule
        // everywhere a collection is pasted, saved or loaded, and it matters
        // most here: parseArenaCollection picks ONE format for the whole
        // text from the first line that fits, so a list mixing "4 Opt (XLN)
        // 65" with plain "2 Shock" lines silently dropped the plain ones.
        // Tidied, every line is plain "qty name", which it always reads.
        //
        // After the size check above on purpose: the limits bound the text as
        // it arrived, and tidying is itself per-line work that shouldn't run
        // on a request those limits exist to refuse.
        //
        // Nothing left (no collection pasted, or only "Deck"/"Sideboard"
        // headers) is simply owning nothing; the parser isn't called, since
        // it logs empty input as an error and this isn't one.
        const mergedCollection = typeof collection === "string" ? tidyCollection(collection) : "";

        // Collection MUST use same mode so canonical keys match
        const collectionMap = mergedCollection
            ? await parseArenaCollection(mergedCollection, arenaMode)
            : new Map<string, number>();

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

        // Cards with no Arena printing at all can't actually be acquired on
        // Arena — they still show up in the breakdown (flagged), but are
        // excluded from anything that represents "cost to get this via
        // Arena": wildcards, set recommendations, and the Arena Import list.
        const arenaAcquirableCards = arenaMode
            ? neededCards.filter((c) => c.lookup?.availableOnArena !== false)
            : neededCards;

        // Arena Mode only: compute recommendations
        const ranked = arenaMode ? rankSets(arenaAcquirableCards) : null;

        const response: any = {
            breakdown: neededCards,
            shoppingList: arenaAcquirableCards,
            missingCards: missingDeckCards,
        };

        if (arenaMode) {
            response.recommendations = ranked;
            response.wildcards = estimateWildcards(arenaAcquirableCards);
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
