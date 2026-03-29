// lib/arenaLogic.ts

import { normalizeName } from "./nameUtils";
import { lookupCard } from "./scryfall";

/**
 * Lines that should be ignored entirely.
 */
const IGNORE_LINES = [
    "commander",
    "sideboard",
    "deck",
    "decklist",
    "deck list",
    "companion",
];

/**
 * Extracts a printed-like name from Arena collection entries.
 * Fully guarded against undefined/null input.
 */
function extractName(raw: string): string {
    if (!raw || typeof raw !== "string") return "";

    let name = raw.trim();
    if (!name) return "";

    // Remove DFC back faces
    if (typeof name === "string" && name.includes("//")) {
        const parts = name.split("//");
        if (parts && parts[0]) name = parts[0].trim();
    }

    // Remove parentheses (set codes, collector numbers)
    name = name.replace(/\([^)]*\)/g, "").trim();

    // Remove collector numbers like "123a" or "45"
    name = name.replace(/\b\d+[a-zA-Z]?\b/g, "").trim();

    // Remove trailing punctuation
    name = name.replace(/[.,:;]+$/, "").trim();

    // Collapse double spaces
    name = name.replace(/\s{2,}/g, " ");

    return name || "";
}

/**
 * Parses Arena CSV format:
 * "Card Name","Set","# Owned"
 */
function tryArenaCSV(lines: string[]): Map<string, number> | null {
    const map = new Map<string, number>();

    for (const line of lines) {
        const match = line.match(/^"(.+?)","(.+?)","(\d+)"$/);
        if (!match) return null;

        const name = match[1];
        const qty = parseInt(match[3], 10);

        map.set(name, (map.get(name) ?? 0) + qty);
    }

    return map;
}

/**
 * Unified Arena collection parser.
 * Canonical identity key = oracle name (Scryfall's `name`).
 */
export async function parseArenaCollection(
    text: string,
    arenaMode = true
): Promise<Map<string, number>> {
    const lines = text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);

    // 1. Try Arena CSV
    const csv = tryArenaCSV(lines);
    if (csv) return await resolveCanonical(csv, arenaMode);

    // 2. Fallback: treat each line as "1 Card Name"
    const fallback = new Map<string, number>();
    for (const line of lines) {
        const lower = line.toLowerCase();
        if (IGNORE_LINES.includes(lower)) continue;

        fallback.set(line, (fallback.get(line) ?? 0) + 1);
    }

    return await resolveCanonical(fallback, arenaMode);
}

/**
 * Converts raw names → canonical oracle-name keys.
 * Logs "card not found: NAME" when lookup fails.
 */
async function resolveCanonical(
    rawMap: Map<string, number>,
    arenaMode: boolean
): Promise<Map<string, number>> {
    const final = new Map<string, number>();

    for (const [rawName, qty] of rawMap.entries()) {
        const extracted = extractName(rawName);
        if (!extracted) continue;

        const normalized = normalizeName(extracted);

        // Lookup card metadata
        const card = await lookupCard(normalized, arenaMode);

        if (!card || card.failed) {
            console.error(`card not found: ${rawName}`);
            continue;
        }

        // ⭐ Canonical identity key = oracle name
        const canonical = normalizeName(card.name);

        final.set(canonical, (final.get(canonical) ?? 0) + qty);
    }

    return final;
}