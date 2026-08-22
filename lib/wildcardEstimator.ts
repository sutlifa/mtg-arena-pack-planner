// lib/wildcardEstimator.ts

export interface WildcardNeed {
    card: string;
    needed: number;
    lookup: {
        rarity?: string | null;
    } | null | undefined;
}

export interface WildcardCounts {
    common: number;
    uncommon: number;
    rare: number;
    mythic: number;
    other: number; // special/bonus-sheet rarities not covered by standard wildcards
}

const RARITY_BUCKET: Record<string, keyof WildcardCounts> = {
    common: "common",
    uncommon: "uncommon",
    rare: "rare",
    mythic: "mythic",
    "mythic rare": "mythic",
};

/**
 * Counts how many of each wildcard type are needed to craft the missing
 * cards, one wildcard per missing copy (Arena Mode only — wildcard rarity
 * follows the Arena printing's rarity from the resolved lookup).
 */
export function estimateWildcards(neededCards: WildcardNeed[]): WildcardCounts {
    const counts: WildcardCounts = {
        common: 0,
        uncommon: 0,
        rare: 0,
        mythic: 0,
        other: 0,
    };

    for (const entry of neededCards) {
        const rarity = entry.lookup?.rarity?.toLowerCase();
        const bucket = (rarity && RARITY_BUCKET[rarity]) || "other";
        counts[bucket] += entry.needed;
    }

    return counts;
}
