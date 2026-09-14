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
 * The point past which the printed sheet is worth a word of warning.
 *
 * Measured rather than guessed, and the measurement is content-dependent:
 * 25 matchups with full out/in lists, notes and some play/draw splits fill
 * about 72% of a Letter page in three columns, while 28 barely-filled ones
 * come in at 53%. So this is a soft advisory, not a limit — the UI says the
 * sheet *may* run to a second page and leaves the choice to the user.
 */
export const ONE_PAGE_MATCHUPS = 25;

export function isSupportedFormat(slug: unknown): slug is FormatSlug {
    return typeof slug === "string" && SUPPORTED_FORMATS.some((f) => f.slug === slug);
}

export function formatLabel(slug: string): string {
    return SUPPORTED_FORMATS.find((f) => f.slug === slug)?.label ?? slug;
}
