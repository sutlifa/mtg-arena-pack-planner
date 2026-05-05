// lib/deckParser.ts

import { normalizeName } from "./nameUtils";
import { lookupCard } from "./scryfall";
import { serverAliasMap } from "./serverAliasMap";

function extractQtyAndName(line: string): { qty: number; rawName: string } | null {
    let m = line.match(/^(\d+)\s+(.+)$/);
    if (m) return { qty: parseInt(m[1], 10), rawName: m[2].trim() };

    m = line.match(/^(\d+)x\s+(.+)$/i);
    if (m) return { qty: parseInt(m[1], 10), rawName: m[2].trim() };

    m = line.match(/^(.+)\s+(\d+)$/);
    if (m) return { qty: parseInt(m[2], 10), rawName: m[1].trim() };

    return null;
}

async function parseSingleDeck(
    text: string,
    arenaMode: boolean
): Promise<{ deckMap: Map<string, number>, missing: string[] }> {

    const deckMap = new Map<string, number>();
    const missing: string[] = [];

    const lines = text
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

    for (const line of lines) {
        if (/^sideboard$/i.test(line)) continue;

        const parsed = extractQtyAndName(line);
        if (!parsed) continue;

        const { qty, rawName } = parsed;
        const normalized = normalizeName(rawName);

        const lookupName = arenaMode
            ? (serverAliasMap[normalized] ?? normalized)
            : normalized;

        let card;
        try {
            card = await lookupCard(lookupName, arenaMode);
        } catch {
            missing.push(rawName);
            continue;
        }

        if (!card || (card as any).failed) {
            missing.push(rawName);
            continue;
        }

        const canonical = normalizeName(
            arenaMode
                ? (card.printed_name ?? card.name)
                : card.name
        );

        const current = deckMap.get(canonical) ?? 0;

        if (arenaMode) {
            // Arena Mode: sum within deck, cap at 4
            deckMap.set(canonical, Math.min(4, current + qty));
        } else {
            // Paper Mode: ALWAYS sum within a single deck
            deckMap.set(canonical, current + qty);
        }
    }

    return { deckMap, missing };
}

export async function parseDecklist(
    input: string | string[] | undefined | null,
    arenaMode = false,
    mergePaperCounts = false
): Promise<{ map: Map<string, number>, missing: string[] }> {

    const finalMap = new Map<string, number>();
    const finalMissing: string[] = [];

    if (!input) {
        console.error("parseDecklist received invalid input:", input);
        return { map: finalMap, missing: finalMissing };
    }

    let deckTexts: string[];

    if (Array.isArray(input)) {
        deckTexts = input.filter((d) => d && d.trim().length > 0);
    } else if (typeof input === "string") {
        deckTexts = input
            .split(/\n\s*\n/)
            .map((d) => d.trim())
            .filter((d) => d.length > 0);

        if (deckTexts.length === 0) deckTexts = [input];
    } else {
        console.error("parseDecklist received invalid input type:", typeof input);
        return { map: finalMap, missing: finalMissing };
    }

    for (const deckText of deckTexts) {
        const { deckMap, missing } = await parseSingleDeck(deckText, arenaMode);

        for (const m of missing) finalMissing.push(m);

        for (const [canonical, qty] of deckMap.entries()) {
            const current = finalMap.get(canonical) ?? 0;

            if (arenaMode) {
                // Arena Mode: merge decks using MAX, cap at 4
                finalMap.set(canonical, Math.min(4, Math.max(current, qty)));
            } else {
                if (mergePaperCounts) {
                    // Paper SUM MODE: sum across decks
                    finalMap.set(canonical, current + qty);
                } else {
                    // Paper MAX MODE: max across decks
                    finalMap.set(canonical, Math.max(current, qty));
                }
            }
        }
    }

    return { map: finalMap, missing: finalMissing };
}
