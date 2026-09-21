// lib/copyName.ts

/**
 * Picking a free name for a duplicated save.
 *
 * Shared by guides, collections and comparisons because all three sit behind
 * a unique index on (user_id, name) and all three duplicate the same way: the
 * copy has to land on a name the owner is not already using, or the insert
 * fails on 23505 instead of producing the row the user asked for.
 */

/** Matches lib/savedRoutes MAX_NAME_LENGTH — a copy must stay re-saveable. */
export const MAX_COPY_NAME_LENGTH = 120;

/**
 * `<base> (copy)`, or `<base> (copy 2)`, `(copy 3)`... if those are taken.
 *
 * An existing "(copy)" / "(copy N)" suffix on the source is stripped first,
 * so duplicating a duplicate gives "Deck (copy 2)" rather than the
 * "Deck (copy) (copy)" pile-up that three clicks would otherwise produce.
 *
 * Comparison is case-insensitive even though Postgres' uniqueness is not.
 * That is deliberate: "deck (copy)" and "Deck (copy)" would both be accepted
 * by the index but are indistinguishable in a list, and a duplicate button
 * that appears to do nothing is worse than one that numbers up.
 *
 * `taken` is the owner's existing names, read in the same request. Two copies
 * racing can still collide, which the route reports as a 409 rather than
 * pretending to have saved.
 */
export function copyName(base: string, taken: Iterable<string>): string {
    const used = new Set(Array.from(taken, (n) => n.trim().toLowerCase()));
    const root = base.replace(/\s*\(copy(?:\s+\d+)?\)\s*$/i, "").trim() || base.trim();

    for (let n = 1; n <= 999; n++) {
        const suffix = n === 1 ? " (copy)" : ` (copy ${n})`;
        // Trimmed from the front of the suffix, not the end of the name, so
        // the "(copy)" marker always survives a very long source name.
        const head = root.slice(0, MAX_COPY_NAME_LENGTH - suffix.length).trimEnd();
        const candidate = `${head}${suffix}`;
        if (!used.has(candidate.toLowerCase())) return candidate;
    }

    // 999 copies of one name is not a real case; rather than loop forever,
    // fall back to something certainly unused and let the user rename it.
    const suffix = ` (copy ${Date.now()})`;
    return `${root.slice(0, MAX_COPY_NAME_LENGTH - suffix.length).trimEnd()}${suffix}`;
}
