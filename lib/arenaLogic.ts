export function computeNeededCopies(
  deckMap: Map<string, number>,
  collectionMap: Map<string, number>
) {
  const needed = new Map<string, number>();

  deckMap.forEach((qty, card) => {
    const owned = collectionMap.get(card) ?? 0;
    const result = Math.max(qty - owned, 0);
    needed.set(card, result);
  });

  return needed;
}