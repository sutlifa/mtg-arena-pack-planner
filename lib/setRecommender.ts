export function rankSets(cardResults: any[]) {
  const setMap = new Map();

  for (const row of cardResults) {
    const pack = row.lookup?.recommendedPackPrint;
    if (!pack) continue;

    const code = pack.set?.toUpperCase?.() ?? "UNKNOWN";
    const setName = pack.set_name ?? "Unknown Set";
    const release = pack.released_at ?? "";
    const needed = row.needed ?? 0;

    if (!setMap.has(code)) {
      setMap.set(code, {
        setCode: code,
        setName,
        release,
        cards: [],
        totalCopies: 0,
        uniqueCards: 0,
      });
    }

    const entry = setMap.get(code);
    entry.cards.push(`${row.card} (${needed})`);
    entry.totalCopies += needed;
    entry.uniqueCards += 1;
  }

  return [...setMap.values()].sort((a, b) => {
    if (b.totalCopies !== a.totalCopies)
      return b.totalCopies - a.totalCopies;
    return b.uniqueCards - a.uniqueCards;
  });
}