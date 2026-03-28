// ⭐ In-memory cache to avoid repeated Scryfall calls within a function lifetime
const cache = new Map<string, any>();

async function safeFetch(url: string, retries = 3): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      // Handle Scryfall rate limits
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 400 + i * 400));
        continue;
      }

      if (!res.ok) {
        throw new Error(`Scryfall returned ${res.status}`);
      }

      return await res.json();
    } catch (err) {
      if (i === retries - 1) {
        console.error("SCRYFALL LOOKUP FAILED:", url, err);
        return null;
      }

      // Exponential backoff
      await new Promise((r) => setTimeout(r, 300 + i * 300));
    }
  }

  return null;
}

function normalizeCardData(data: any, fallbackName: string) {
  if (!data) {
    return {
      name: fallbackName,
      set: "unknown",
      set_name: "Unknown Set",
      set_icon_svg_uri: null,
      rarity: "unknown",
      image_uris: { normal: null },
      card_faces: null,
      failed: true,
    };
  }

  const image =
    data.image_uris?.normal ||
    data.card_faces?.[0]?.image_uris?.normal ||
    null;

  return {
    name: data.name ?? fallbackName,
    set: data.set ?? "unknown",
    set_name: data.set_name ?? "Unknown Set",
    set_icon_svg_uri: data.set_icon_svg_uri ?? null,
    rarity: data.rarity ?? "unknown",
    image_uris: { normal: image },
    card_faces: data.card_faces || null,
    failed: false,
  };
}

export async function lookupCard(name: string) {
  // Cache hit
  if (cache.has(name)) {
    return cache.get(name);
  }

  // 1. Exact search
  const exactUrl = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(
    name
  )}`;

  let data = await safeFetch(exactUrl);

  // 2. Fuzzy fallback
  if (!data) {
    const fuzzyUrl = `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(
      name
    )}`;
    data = await safeFetch(fuzzyUrl);
  }

  // 3. Normalize + cache
  const normalized = normalizeCardData(data, name);
  cache.set(name, normalized);

  return normalized;
}