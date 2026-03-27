const EXCLUDED_SET_TYPES = new Set([
  "promo",
  "token",
  "masterpiece",
  "memorabilia",
  "minigame",
]);

async function fetchAllPages(url: string) {
  const results: any[] = [];
  let next: string | null = url;

  while (next) {
    const res: Response = await fetch(next, {
      headers: { Accept: "application/json" },
      next: { revalidate: 86400 },
    });

    const json: any = await res.json();
    if (json.object === "error") throw new Error(json.details);

    results.push(...json.data);
    next = json.has_more ? json.next_page : null;
  }

  return results;
}

export async function lookupCard(cardName: string) {
  const res: Response = await fetch(
    `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cardName)}`,
    { headers: { Accept: "application/json" } }
  );

  const named: any = await res.json();
  if (named.object === "error") {
    return { ok: false, error: named.details };
  }

  const allPrints: any[] = await fetchAllPages(named.prints_search_uri);

  const arenaPrints = allPrints
    .filter((p: any) => p.games?.includes("arena") || p.arena_id)
    .sort((a: any, b: any) =>
      String(b.released_at).localeCompare(String(a.released_at))
    );

  const latest = arenaPrints[0] ?? null;
  const booster = arenaPrints.find(
    (p: any) => p.booster && !EXCLUDED_SET_TYPES.has(p.set_type)
  );

  return {
    ok: true,
    name: named.name,
    latestArenaPrint: latest,
    recommendedPackPrint: booster ?? null,
  };
}