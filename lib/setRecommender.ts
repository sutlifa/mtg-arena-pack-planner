// lib/setRecommender.ts

export interface LookupResult {
    card: string;              // canonical name
    displayName: string;       // printing-specific name
    needed: number;
    lookup: {
        set: string | null;
        set_name: string | null;
        set_icon_svg_uri: string | null;
        paper_name?: string;
        arena_name?: string;
        name?: string;
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
        displayName: string;
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
        console.log("SET RECOMMENDER ENTRY:", entry);
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

        const paperName =
            lookup.paper_name ??
            lookup.name ??
            entry.card;

        const arenaName =
            lookup.arena_name ??
            lookup.paper_name ??
            lookup.name ??
            entry.card;

        const rarity = lookup.rarity ?? "unknown";

        bucket.cards.push({
            canonical: entry.card,
            needed: entry.needed,
            displayName: arenaMode ? arenaName : paperName,
            rarity,
        });
    }

    return Array.from(setMap.values()).sort(
        (a, b) => b.totalNeeded - a.totalNeeded
    );
}