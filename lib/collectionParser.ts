// lib/collectionParser.ts

import { normalizeName } from "./nameUtils";
import { lookupCard } from "./scryfall";
import { serverAliasMap } from "./serverAliasMap";

/**
 * Arena CSV parser
 */
function tryArenaCSV(lines: string[]): Map<string, number> | null {
    const map = new Map<string, number>();
    if (!lines[0]?.toLowerCase().includes("quantity")) return null;

    for (const line of lines.slice(1)) {
        const parts = line.split(",");
        if (parts.length < 2) continue;

        const qty = parseInt(parts[0], 10);
        const rawName = parts[1]?.trim();
        if (!qty || !rawName) continue;

        const normalized = normalizeName(rawName);
        map.set(normalized, (map.get(normalized) ?? 0) + qty);
    }

    return map;
}

/**
 * Simple list parser (Aetherhub compatible)
 */
function trySimpleList(lines: string[]): Map<string, number> | null {
    const map = new Map<string, number>();
    let matched = false;

    for (const line of lines) {
        const m = line.match(/^(\d+)\s+(.+)$/);
        if (!m) continue;

        matched = true;
        const qty = parseInt(m[1], 10);
        let rawName = m[2];

        rawName = rawName.replace(/\([A-Za-z0-9]+\)\s*\d+[A-Za-z]*$/, "").trim();

        const normalized = normalizeName(rawName);
        map.set(normalized, (map.get(normalized) ?? 0) + qty);
    }

    return matched ? map : null;
}

/**
 * Paper list parser
 */
function tryPaperList(lines: string[]): Map<string, number> | null {
    const map = new Map<string, number>();
    let matched = false;

    for (const line of lines) {
        const m = line.match(/^(\d+)\s+(.+?)\s+\([^)]+\)\s+\d+[A-Za-z]*$/);
        if (!m) continue;

        matched = true;
        const qty = parseInt(m[1], 10);
        const rawName = m[2];

        const normalized = normalizeName(rawName);
        map.set(normalized, (map.get(normalized) ?? 0) + qty);
    }

    return matched ? map : null;
}

/**
 * Unified collection parser
 */
export async function parseArenaCollection(
    text: string | undefined | null,
    arenaMode = false
): Promise<Map<string, number>> {
    const finalMap = new Map<string, number>();

    if (!text || typeof text !== "string") {
        console.error("parseArenaCollection received invalid text:", text);
        return finalMap;
    }

    const lines = text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);

    const parsers = [tryArenaCSV, trySimpleList, tryPaperList];

    for (const parser of parsers) {
        const parsed = parser(lines);
        if (parsed) {
            for (const [name, qty] of parsed.entries()) {

                // ⭐ Apply alias BEFORE lookupCard
                const aliasName = serverAliasMap[name] ?? name;

                let card;
                try {
                    card = await lookupCard(aliasName, arenaMode);
                } catch {
                    continue;
                }
                if (!card || card.failed) continue;

                // ⭐ Arena dual-name fix (ONLY affects cards like Ademi)
                const canonical = normalizeName(
                    arenaMode && card.printed_name && card.printed_name !== card.name
                        ? card.printed_name
                        : card.name
                );

                finalMap.set(canonical, (finalMap.get(canonical) ?? 0) + qty);
            }
            return finalMap;
        }
    }

    // Fallback: treat each line as qty=1
    for (const line of lines) {
        let rawName = line;

        rawName = rawName.replace(/\([A-Za-z0-9]+\)\s*\d+[A-Za-z]*$/, "").trim();

        const normalized = normalizeName(rawName);

        // ⭐ Apply alias BEFORE lookupCard
        const aliasName = serverAliasMap[normalized] ?? normalized;

        let card;
        try {
            card = await lookupCard(aliasName, arenaMode);
        } catch {
            continue;
        }

        if (!card || card.failed) continue;

        // ⭐ Arena dual-name fix (ONLY affects cards like Ademi)
        const canonical = normalizeName(
            arenaMode && card.printed_name && card.printed_name !== card.name
                ? card.printed_name
                : card.name
        );

        finalMap.set(canonical, (finalMap.get(canonical) ?? 0) + 1);
    }

    return finalMap;
}
