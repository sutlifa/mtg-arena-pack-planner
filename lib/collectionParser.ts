// lib/collectionParser.ts
import { extractName } from "./deckParser";
import { normalizeName } from "./nameUtils";
import { resolveName } from "./aliasResolver";

export function parseArenaCollection(text: string): Map<string, number> {
    const map = new Map<string, number>();

    const lines = text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);

    for (const line of lines) {
        let qty: number | null = null;
        let rawName = line;

        // Format: "4 Card Name"
        let match = line.match(/^(\d+)\s+(.+)$/);
        if (match) {
            qty = parseInt(match[1], 10);
            rawName = match[2];
        }

        // Format: "4x Card Name"
        if (!qty) {
            match = line.match(/^(\d+)x\s+(.+)$/i);
            if (match) {
                qty = parseInt(match[1], 10);
                rawName = match[2];
            }
        }

        // Format: "Card Name: 4"
        if (!qty) {
            match = line.match(/^(.+):\s*(\d+)$/);
            if (match) {
                rawName = match[1];
                qty = parseInt(match[2], 10);
            }
        }

        if (!qty) continue;

        // Extract printed-like name (removes set codes, collector numbers, DFC back faces)
        const extracted = extractName(rawName);
        if (!extracted) continue;

        // Normalize for matching
        const normalized = normalizeName(extracted);

        // ⭐ Apply canonical alias resolution
        const canonical = resolveName(normalized);

        // Optional set code (e.g., "(MKM)")
        const setMatch = rawName.match(/\(([A-Za-z0-9]{2,5})\)/);
        const setCode = setMatch ? setMatch[1].toLowerCase() : null;

        // Store canonical name
        map.set(canonical, (map.get(canonical) ?? 0) + qty);

        // Store canonical name + set code
        if (setCode) {
            const key = `${canonical}|${setCode}`;
            map.set(key, (map.get(key) ?? 0) + qty);
        }
    }

    return map;
}