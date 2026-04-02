// lib/setRecommender.ts

export interface LookupResult {
    card: string;              // canonical name
    needed: number;
    lookup: {
        set: string | null;
        set_name: string | null;
        set_icon_svg_uri: string | null;
        printed_name?: string;   // printing-specific name (Detect Intrusion)
        rarity?: string;
    } | null | undefined;
}

export interface RankedSet {
    set: string;
    set_name: string | null;
    set_icon_svg_uri: string | null;
    totalNeeded: number;
    uniqueCards: number;
    cards: {
        canonical: string;
        needed: number;
        printed_name: string;    // always present
        rarity: string;
    }[];
}

/**
 * Fully hardened set recommender.
 */
export function rankSets(
    lookupResults: LookupResult[],
    arenaMode: boolean = false
): RankedSet[] {
    const setMap: Map<string, RankedSet> = new Map();

    for (const entry of lookupResults) {
        const lookup = entry.lookup;
        if (!lookup || typeof lookup !== "object") continue;

        const setCode = lookup.set;
        if (!setCode || typeof setCode !== "string") continue;

        if (!setMap.has(setCode)) {
            setMap.set(setCode, {
                set: setCode,
                set_name: lookup.set_name ?? null,
                set_icon_svg_uri: lookup.set_icon_svg_uri ?? null,
                totalNeeded: 0,
                uniqueCards: 0,
                cards: [],
            });
        }

        const bucket = setMap.get(setCode)!;

        bucket.totalNeeded += entry.needed;
        bucket.uniqueCards += 1;

        // ⭐ Always use lookup.printed_name (Detect Intrusion / Spider-Sense)
        // Fallback to canonical name if somehow missing
        const printedName =
            lookup.printed_name ??
            entry.card;

        const rarity = lookup.rarity ?? "unknown";

        bucket.cards.push({
            canonical: entry.card,
            needed: entry.needed,
            printed_name: printedName,
            rarity,
        });
    }

    return Array.from(setMap.values()).sort(
        (a, b) => b.totalNeeded - a.totalNeeded
    );
}
