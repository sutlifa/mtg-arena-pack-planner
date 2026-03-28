export async function rankSets(cardResults: any[]) {
  const setMap = new Map<string, any>();
  const setCache = new Map<string, any>();

  async function getSetInfo(code: string) {
    const lower = code.toLowerCase();
    if (setCache.has(lower)) return setCache.get(lower);

    const res = await fetch(`https://api.scryfall.com/sets/${lower}`);
    const json = await res.json();

    if (json.object === "error") {
      setCache.set(lower, null);
      return null;
    }

    setCache.set(lower, json);
    return json;
  }

  for (const row of cardResults) {
    const lookup = row.lookup;
    if (!lookup) continue;

    const code = lookup.set?.toUpperCase?.() ?? "UNKNOWN";
    const setName = lookup.set_name ?? "Unknown Set";
    const needed = row.needed ?? 0;

    if (!setMap.has(code)) {
      const setInfo = await getSetInfo(code);

      setMap.set(code, {
        code,
        name: setName,
        release: setInfo?.released_at ?? "",
        icon: setInfo?.icon_svg_uri ?? lookup.set_icon_svg_uri ?? null,
        cards: [],
        totalCopies: 0,
        uniqueCards: 0,
      });
    }

    const entry = setMap.get(code);

    entry.cards.push({
      name: row.card,
      needed,
      rarity: lookup.rarity ?? "unknown", // ⭐ REQUIRED
    });

    entry.totalCopies += needed;
    entry.uniqueCards += 1;
  }

  return [...setMap.values()].sort((a, b) => {
    if (b.totalCopies !== a.totalCopies)
      return b.totalCopies - a.totalCopies;
    return b.uniqueCards - a.uniqueCards;
  });
}