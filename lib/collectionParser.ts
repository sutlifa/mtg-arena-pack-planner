// lib/collectionParser.ts

import { normalizeName } from "./nameUtils";
import { lookupCard } from "./scryfall";
import { serverAliasMap } from "./serverAliasMap";

// ⭐ NEW: strip [SET] formats like [SOS], [MKM], [LTR]
function stripBracketSets(name: string): string {
    return name.replace(/\s*\[[A-Za-z0-9]+\]/g, "").trim();
}

/**
 * FORMAT 1 — Arena CSV
 */
function tryArenaCSV(lines: string[]): Map<string, number> | null {
    if (!lines[0]?.toLowerCase().includes("quantity")) return null;

    const map = new Map<string, number>();

    for (const line of lines.slice(1)) {
        const parts = line.split(",");
        if (parts.length < 2) continue;

        const qty = parseInt(parts[0], 10);
        let rawName = parts[1]?.trim();
        if (!qty || !rawName) continue;

        rawName = stripBracketSets(rawName);

        const normalized = normalizeName(rawName);
        map.set(normalized, (map.get(normalized) ?? 0) + qty);
    }

    return map;
}

/**
 * FORMAT 2 — Arena TEXT EXPORT
 */
function tryArenaText(lines: string[]): Map<string, number> | null {
    const map = new Map<string, number>();
    let matched = false;

    for (const line of lines) {
        const m = line.match(/^(\d+)\s+(.+?)\s+\([A-Za-z0-9]+\)\s+\d+[A-Za-z]*$/);
        if (!m) continue;

        matched = true;
        const qty = parseInt(m[1], 10);
        let rawName = m[2].trim();

        rawName = stripBracketSets(rawName);

        const normalized = normalizeName(rawName);
        map.set(normalized, (map.get(normalized) ?? 0) + qty);
    }

    return matched ? map : null;
}

/**
 * FORMAT 3 — Simple list (Aetherhub, MTGO, Moxfield)
 */
function trySimpleList(lines: string[]): Map<string, number> | null {
    const map = new Map<string, number>();
    let matched = false;

    for (const line of lines) {
        const m = line.match(/^(\d+)\s+(.+)$/);
        if (!m) continue;

        matched = true;
        const qty = parseInt(m[1], 10);
        let rawName = m[2].trim();

        rawName = stripBracketSets(rawName);

        rawName = rawName.replace(/\([A-Za-z0-9]+\)\s*\d+[A-Za-z]*$/, "").trim();

        const normalized = normalizeName(rawName);
        map.set(normalized, (map.get(normalized) ?? 0) + qty);
    }

    return matched ? map : null;
}

/**
 * FORMAT 4 — Paper list with set code + collector number
 */
function tryPaperList(lines: string[]): Map<string, number> | null {
    const map = new Map<string, number>();
    let matched = false;

    for (const line of lines) {
        const m = line.match(/^(\d+)\s+(.+?)\s+\([^)]+\)\s+\d+[A-Za-z]*$/);
        if (!m) continue;

        matched = true;
        const qty = parseInt(m[1], 10);
        let rawName = m[2].trim();

        rawName = stripBracketSets(rawName);

        const normalized = normalizeName(rawName);
        map.set(normalized, (map.get(normalized) ?? 0) + qty);
    }

    return matched ? map : null;
}

/**
 * MASTER PARSER
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

    const parsers = [
        tryArenaCSV,
        tryArenaText,
        trySimpleList,
        tryPaperList
    ];

    let parsed: Map<string, number> | null = null;

    for (const parser of parsers) {
        parsed = parser(lines);
        if (parsed) break;
    }

    if (!parsed) {
        parsed = new Map<string, number>();

        for (const line of lines) {
            let rawName = line;

            rawName = stripBracketSets(rawName);

            rawName = rawName.replace(/\([A-Za-z0-9]+\)\s*\d+[A-Za-z]*$/, "").trim();

            const normalized = normalizeName(rawName);
            parsed.set(normalized, (parsed.get(normalized) ?? 0) + 1);
        }
    }

    for (const [name, qty] of parsed.entries()) {
        const lookupName = arenaMode
            ? (serverAliasMap[name] ?? name)
            : name;

        let card;
        try {
            card = await lookupCard(lookupName, arenaMode);
        } catch {
            continue;
        }

        if (!card || card.failed) continue;

        const canonical = normalizeName(
            arenaMode
                ? (card.printed_name ?? card.name)
                : card.name
        );

        finalMap.set(canonical, (finalMap.get(canonical) ?? 0) + qty);
    }

    return finalMap;
}
