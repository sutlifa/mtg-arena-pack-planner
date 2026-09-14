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

export const MAX_ARCHETYPES = 25;

export function isSupportedFormat(slug: unknown): slug is FormatSlug {
    return typeof slug === "string" && SUPPORTED_FORMATS.some((f) => f.slug === slug);
}

export function formatLabel(slug: string): string {
    return SUPPORTED_FORMATS.find((f) => f.slug === slug)?.label ?? slug;
}
