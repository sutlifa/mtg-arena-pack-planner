// lib/setRecommender.ts
import { getCardMap } from "./cardData";
import { resolveName } from "./aliasResolver";

export async function rankSets(cardResults: any[]) {
    const setMap = new Map<string, any>();
    const setCache = new Map<string, any>();

    const bulk = await getCardMap();

    function getBulkSetInfo(code: string) {
        for (const name in bulk) {
            for (const c of bulk[name]) {
                if (c.set.toLowerCase() === code.toLowerCase()) {
                    return {
                        code: c.set.toUpperCase(),
                        name: c.set_name,
                        icon: c.set_icon_svg_uri,
                        release: c.released_at ?? "",
                    };
                }
            }
        }
        return null;
    }

    async function getSetInfo(code: string) {
        const lower = code.toLowerCase();
        if (setCache.has(lower)) return setCache.get(lower);

        const bulkInfo = getBulkSetInfo(code);
        if (bulkInfo) {
            setCache.set(lower, bulkInfo);
            return bulkInfo;
        }

        const res = await fetch(`https://api.scryfall.com/sets/${lower}`);
        const json = await res.json();

        if (json.object === "error") {
            setCache.set(lower, null);
            return null;
        }

        const info = {
            code: json.code?.toUpperCase() ?? code.toUpperCase(),
            name: json.name,
            icon: json.icon_svg_uri,
            release: json.released_at ?? "",
        };

        setCache.set(lower, info);
        return info;
    }

    for (const row of cardResults) {
        const lookup = row.lookup;
        if (!lookup) continue;

        const code = lookup.set?.toUpperCase() ?? "UNKNOWN";
        const needed = row.needed ?? 0;

        // ⭐ Canonical name (fixes Detect Intrusion → Spider‑Sense)
        const canonicalName = resolveName(row.card);

        if (!setMap.has(code)) {
            const setInfo = await getSetInfo(code);

            setMap.set(code, {
                code,
                name: setInfo?.name ?? lookup.set_name,
                release: setInfo?.release ?? "",
                icon: setInfo?.icon ?? lookup.set_icon_svg_uri,
                cards: [],
                totalCopies: 0,
                uniqueCards: 0,
            });
        }

        const entry = setMap.get(code);

        entry.cards.push({
            name: canonicalName,
            needed,
            rarity: lookup.rarity ?? "unknown",
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