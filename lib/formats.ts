// lib/formats.ts

/**
 * The constructed formats the Sideboard Planner supports. The slug is also
 * the MTGGoldfish metagame path segment, and the allowlist the archetype
 * route validates against — a format not in this list is never fetched.
 */
export const SUPPORTED_FORMATS = [
    { slug: "standard", label: "Standard" },
    { slug: "pioneer", label: "Pioneer" },
    { slug: "modern", label: "Modern" },
    { slug: "legacy", label: "Legacy" },
    { slug: "pauper", label: "Pauper" },
] as const;

export type FormatSlug = (typeof SUPPORTED_FORMATS)[number]["slug"];

/** How many archetypes we will pull from the metagame for the picker. */
export const MAX_ARCHETYPES = 50;

/**
 * How many matchups the "Tick top N" shortcut selects: the most a printed
 * sheet is designed to hold.
 *
 * Not a limit. You can pick as many as you like (up to MAX_ARCHETYPES), and
 * whether they fit one page is measured, not predicted from a count — the
 * sheet's text shrinks to fit (lib/printFit.ts), and 30 matchups with full
 * out/in lists and short notes still fit one Letter page at a readable size.
 * Past that, or with long notes, the planner says when the sheet would run
 * onto a second page.
 */
export const SHEET_TARGET_MATCHUPS = 30;

/**
 * The metagame windows MTGGoldfish offers ("Show decks from the last N
 * days"), and the one its metagame page shows by default. Only these values
 * are ever sent upstream.
 */
export const META_PERIODS = [7, 14, 30, 90, 365] as const;
export type MetaPeriod = (typeof META_PERIODS)[number];
export const DEFAULT_META_PERIOD: MetaPeriod = 30;

export function isMetaPeriod(n: unknown): n is MetaPeriod {
    return typeof n === "number" && (META_PERIODS as readonly number[]).includes(n);
}

export function isSupportedFormat(slug: unknown): slug is FormatSlug {
    return typeof slug === "string" && SUPPORTED_FORMATS.some((f) => f.slug === slug);
}

export function formatLabel(slug: string): string {
    return SUPPORTED_FORMATS.find((f) => f.slug === slug)?.label ?? slug;
}
