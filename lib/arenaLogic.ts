// lib/arenaLogic.ts
import { resolveName } from "./aliasResolver";

/**
 * Computes how many copies of each card are still needed,
 * correctly handling:
 * - Adventure cards
 * - Omen / DFC / modal cards
 * - Multiple printings across sets
 *
 * Now also handles:
 * - Arena mechanical names (Detect Intrusion → Spider‑Sense)
 * - Canonical name resolution for both deck and collection
 */
export function computeNeededCopies(
    deckMap: Map<string, number>,
    collectionMap: Map<string, number>
) {
    const needed = new Map<string, number>();

    deckMap.forEach((qtyNeeded, deckKeyRaw) => {
        // ⭐ Canonicalize deck key
        const deckKey = resolveName(deckKeyRaw);
        const [nameOnlyRaw] = deckKey.split("|");

        // ⭐ Canonicalize nameOnly
        const nameOnly = resolveName(nameOnlyRaw);

        let totalOwned = 0;

        // ⭐ Check canonical name-only key
        if (collectionMap.has(nameOnly)) {
            totalOwned = collectionMap.get(nameOnly)!;
        } else {
            // ⭐ Sum all canonical set-specific variants
            for (const [rawKey, qty] of collectionMap.entries()) {
                const canonicalKey = resolveName(rawKey);
                if (canonicalKey.startsWith(nameOnly + "|")) {
                    totalOwned += qty;
                }
            }
        }

        const missing = Math.max(qtyNeeded - totalOwned, 0);

        // ⭐ Store result under canonical deck key
        needed.set(deckKey, missing);
    });

    return needed;
}