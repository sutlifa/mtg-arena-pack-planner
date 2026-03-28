// lib/scryfall.ts
import { getCardMap, ScryfallCard } from "./cardData";
import { normalizeName } from "./nameUtils";
import { resolveName } from "./aliasResolver";

const cache = new Map<string, any>();

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
            set_type: null,
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
        set_type: data.set_type ?? null,
        failed: false,
    };
}

function isCommander(card: ScryfallCard): boolean {
    return card.set_type === "commander";
}

export async function lookupCardLocal(
    name: string,
    arenaMode = false
): Promise<ScryfallCard | null> {
    const map = await getCardMap();

    // ⭐ Canonical name resolution (fixes Detect Intrusion → Spider‑Sense)
    const canonical = resolveName(normalizeName(name));

    const matches = map[canonical];
    if (!matches || matches.length === 0) return null;

    const arenaPrintings = matches.filter((c) => !isCommander(c));
    const commanderPrintings = matches.filter((c) => isCommander(c));

    let pool: ScryfallCard[];

    if (arenaMode) {
        pool = arenaPrintings.length > 0 ? arenaPrintings : commanderPrintings;
    } else {
        pool = matches;
    }

    // Sort by release date (latest first)
    pool.sort((a, b) => {
        const da = new Date(a.released_at || "1900-01-01").getTime();
        const db = new Date(b.released_at || "1900-01-01").getTime();
        return db - da;
    });

    return pool[0];
}

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

async function lookupCardFromScryfall(name: string) {
    const exactUrl = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(
        name
    )}`;
    let data = await safeFetch(exactUrl);

    if (!data) {
        const fuzzyUrl = `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(
            name
        )}`;
        data = await safeFetch(fuzzyUrl);
    }

    return normalizeCardData(data, name);
}

export async function lookupCard(name: string, arenaMode = false) {
    // ⭐ Cache by canonical name
    const canonical = resolveName(normalizeName(name));
    const cacheKey = `${canonical}|${arenaMode}`;

    if (cache.has(cacheKey)) return cache.get(cacheKey);

    // Try local lookup first
    const local = await lookupCardLocal(canonical, arenaMode);
    if (local) {
        const normalized = normalizeCardData(local, canonical);
        cache.set(cacheKey, normalized);
        return normalized;
    }

    // Fallback to Scryfall API
    const api = await lookupCardFromScryfall(canonical);
    cache.set(cacheKey, api);
    return api;
}