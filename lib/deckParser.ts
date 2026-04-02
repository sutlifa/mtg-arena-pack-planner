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
    const missing: string[] = [];   // ⭐ NEW

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

        // ⭐ Arena mode uses alias; Paper mode uses raw normalized name
        const lookupName = arenaMode
            ? (serverAliasMap[normalized] ?? normalized)
            : normalized;

        let card;
        try {
            card = await lookupCard(lookupName, arenaMode);
        } catch {
            missing.push(rawName);   // ⭐ NEW
            continue;
        }

        if (!card || (card as any).failed) {
            missing.push(rawName);   // ⭐ NEW
            continue;
        }

        // ⭐ Canonical key unified across deck + collection
        const canonical = normalizeName(
            arenaMode
                ? (card.printed_name ?? card.name) // Arena name
                : card.name                        // Paper/oracle name
        );

        const current = deckMap.get(canonical) ?? 0;
        deckMap.set(canonical, Math.min(4, current + qty));
    }

    return { deckMap, missing };   // ⭐ NEW
}

export async function parseDecklist(
    input: string | string[] | undefined | null,
    arenaMode = false
): Promise<{ map: Map<string, number>, missing: string[] }> {   // ⭐ NEW

    const finalMap = new Map<string, number>();
    const finalMissing: string[] = [];   // ⭐ NEW

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
        const { deckMap, missing } = await parseSingleDeck(deckText, arenaMode);  // ⭐ NEW

        // Merge missing card names
        for (const m of missing) finalMissing.push(m);   // ⭐ NEW

        for (const [canonical, qty] of deckMap.entries()) {
            const current = finalMap.get(canonical) ?? 0;
            finalMap.set(canonical, Math.max(current, qty));
        }
    }

    return { map: finalMap, missing: finalMissing };   // ⭐ NEW
}
