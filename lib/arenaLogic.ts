// lib/arenaLogic.ts

/**
 * Computes how many copies of each card are still needed,
 * correctly handling:
 * - Adventure cards
 * - Omen / DFC / modal cards
 * - Multiple printings across sets
 *
 * Key rules:
 * - If the collection has a name-only entry ("Card Name"),
 *   we treat that as the authoritative total owned.
 * - Otherwise, we sum all set-specific variants ("Card Name|set").
 */

export function computeNeededCopies(
  deckMap: Map<string, number>,
  collectionMap: Map<string, number>
) {
  const needed = new Map<string, number>();

  deckMap.forEach((qtyNeeded, deckKey) => {
    // deckKey may be "Card Name" or "Card Name|set"
    const [nameOnly] = deckKey.split("|");

    let totalOwned = 0;

    if (collectionMap.has(nameOnly)) {
      // If a name-only key exists, trust it as the total
      totalOwned = collectionMap.get(nameOnly)!;
    } else {
      // Otherwise, sum all set-specific variants
      for (const [key, qty] of collectionMap.entries()) {
        if (key.startsWith(nameOnly + "|")) {
          totalOwned += qty;
        }
      }
    }

    const missing = Math.max(qtyNeeded - totalOwned, 0);
    needed.set(deckKey, missing);
  });

  return needed;
}