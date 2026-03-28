// lib/deckParser.ts
console.log(">>> USING DECK PARSER FROM:", __filename);

import { normalizeName } from "./nameUtils";
import { resolveNameServer } from "./serverAliasMap";

export function extractName(raw: string): string {
    let name = raw.trim();

    // Remove DFC back faces
    if (name.includes("//")) name = name.split("//")[0].trim();

    // Remove parentheses (set codes, collector numbers)
    name = name.replace(/\([^)]*\)/g, "").trim();

    // Remove collector numbers like "123a" or "45"
    name = name.replace(/\b\d+[a-zA-Z]?\b/g, "").trim();

    // Remove trailing punctuation
    name = name.replace(/[.,:;]+$/, "").trim();

    // Collapse double spaces
    name = name.replace(/\s{2,}/g, " ");

    return name;
}

export function parseDecklist(text: string): Map<string, number> {
    const map = new Map<string, number>();

    const lines = text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);

    for (const line of lines) {
        const match = line.match(/^(\d+)\s+(.+)$/);
        if (!match) continue;

        const qty = parseInt(match[1], 10);
        const rawName = match[2];

        // Extract printed-like name
        const extracted = extractName(rawName);
        if (!extracted) continue;

        // Normalize for matching
        const normalized = normalizeName(extracted);

        // Apply canonical alias resolution
        const canonical = resolveNameServer(normalizeName(extracted));

        // 🔥 DEBUG LOG — this is the key
        console.log("PARSED CARD:", {
            rawName,
            extracted,
            normalized,
            canonical,
            aliasExists: canonical !== normalized
        });

        map.set(canonical, (map.get(canonical) ?? 0) + qty);
    }

    return map;
}