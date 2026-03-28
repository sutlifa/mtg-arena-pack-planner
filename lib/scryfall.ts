// lib/scryfall.ts
import {
  getCardMap,
  getCardMapBySet,
  ScryfallCard
} from "./cardData";

const cache = new Map<string, any>();

async function safeFetch(url: string, retries = 3): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 400 + i * 400));
        continue;
      }

      if (!res.ok) throw new Error(`Scryfall returned ${res.status}`);

      return await res.json();
    } catch (err) {
      if (i === retries - 1) return null;
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

export async function lookupCardLocal(name: string): Promise<ScryfallCard | null> {
  const map = await getCardMap();
  const mapBySet = await getCardMapBySet();

  const lower = name.toLowerCase();

  if (lower.includes("|")) {
    const exact = mapBySet[lower];
    if (exact?.length) return exact[0];
  }

  if (map[lower]?.length) return map[lower][0];

  const fuzzy = Object.keys(map).find((k) => k.includes(lower));
  if (fuzzy) return map[fuzzy][0];

  const starts = Object.keys(map).find((k) => k.startsWith(lower));
  if (starts) return map[starts][0];

  return null;
}

async function lookupCardFromScryfall(name: string) {
  const exactUrl = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`;
  let data = await safeFetch(exactUrl);

  if (!data) {
    const fuzzyUrl = `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`;
    data = await safeFetch(fuzzyUrl);
  }

  return normalizeCardData(data, name);
}

export async function lookupCard(name: string) {
  if (cache.has(name)) return cache.get(name);

  const local = await lookupCardLocal(name);
  if (local) {
    const normalized = normalizeCardData(local, name);
    cache.set(name, normalized);
    return normalized;
  }

  const api = await lookupCardFromScryfall(name);
  cache.set(name, api);
  return api;
}