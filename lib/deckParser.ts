// lib/deckParser.ts

import { normalizeName } from "./nameUtils";
import { lookupCard } from "./scryfall";
import { serverAliasMap } from "./serverAliasMap";
import { deckLimits } from "./deckLimits";

// Basic lands are exempt from the 4-copy cap in every mode — a deck can
// legitimately run more than 4 Plains.
const UNLIMITED_CARDS = new Set(
    ["Plains", "Island", "Swamp", "Mountain", "Forest"].map(normalizeName)
);

function capFor(canonical: string, capAt4: boolean): number {
    // Cards whose own rules text overrides the 4-copy limit (Relentless
    // Rats, Nazgûl, etc.) always use that limit, in every mode.
    if (canonical in deckLimits) {
        const limit = deckLimits[canonical];
        return limit === null ? Infinity : limit;
    }

    return capAt4 && !UNLIMITED_CARDS.has(canonical) ? 4 : Infinity;
}

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
    arenaMode: boolean,
    capAt4: boolean
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

        // Sum within a single deck, capped at 4 unless this card is exempt
        // (basic lands) or the cap doesn't apply in this mode (Paper Mode
        // with "add counts together" enabled).
        deckMap.set(canonical, Math.min(capFor(canonical, capAt4), current + qty));
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

    // Cap needed copies at 4 per card unless Paper Mode's "add counts
    // together" is enabled — merging separate decks' needs can legitimately
    // exceed 4. Basic lands (see UNLIMITED_CARDS) are always exempt.
    const capAt4 = arenaMode || !mergePaperCounts;

    for (const deckText of deckTexts) {
        const { deckMap, missing } = await parseSingleDeck(deckText, arenaMode, capAt4);

        for (const m of missing) finalMissing.push(m);

        for (const [canonical, qty] of deckMap.entries()) {
            const current = finalMap.get(canonical) ?? 0;
            const cap = capFor(canonical, capAt4);

            if (!arenaMode && mergePaperCounts) {
                // Paper SUM MODE: sum across decks
                finalMap.set(canonical, Math.min(cap, current + qty));
            } else {
                // Arena Mode, and Paper MAX MODE: merge decks using MAX
                finalMap.set(canonical, Math.min(cap, Math.max(current, qty)));
            }
        }
    }

    return { map: finalMap, missing: finalMissing };
}
