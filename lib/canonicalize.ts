// lib/canonicalize.ts

import { normalizeName } from "./nameUtils";
import { serverAliasMap } from "./serverAliasMap";

export function canonicalize(raw: string): string {
    const cleaned = raw
        .replace(/\([^)]+\)/g, "")     // remove (SET)
        .replace(/\d+[A-Za-z]*$/, "")  // remove collector numbers
        .trim();

    const normalized = normalizeName(cleaned);

    // Apply alias map if present
    return serverAliasMap[normalized] ?? normalized;
}