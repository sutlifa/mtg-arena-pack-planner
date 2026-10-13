// app/components/resolveNames.ts

import type { NameVerdict } from "@/lib/collectionText";

/** /api/card-resolve's per-request limit; longer lists go in chunks of it. */
const RESOLVE_CHUNK = 500;

/**
 * What the server makes of each name: its official spelling, or null and a
 * few close real names. Throws when the server can't be asked, so a caller
 * never mistakes "couldn't check" for "not a card".
 *
 * Every card in the collection is a real card stored under its real name —
 * the add box, a paste and an Arena export all go through here first, and
 * nothing that comes back null is added. That's what lets every tile have a
 * picture and every name match Deck Check's card data exactly. Deck Check's
 * per-deck view (DeckShortfall) resolves each deck's names through the same
 * call, so "Lim-Dul's Vault" in a deck meets "Lim-Dûl's Vault" in the
 * collection instead of reading as missing.
 *
 * `suggest: false` when only the verdict matters (checking a collection that
 * was already saved), which spares the server its "did you mean" search.
 *
 * Lives here rather than in lib/ because it talks to the network; lib/ is
 * pure domain logic.
 */
export async function resolveNames(
    names: string[],
    suggest: boolean
): Promise<Map<string, NameVerdict>> {
    const out = new Map<string, NameVerdict>();
    const unique = [...new Set(names)];
    for (let i = 0; i < unique.length; i += RESOLVE_CHUNK) {
        const res = await fetch("/api/card-resolve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ names: unique.slice(i, i + RESOLVE_CHUNK), suggest }),
        });
        if (!res.ok) throw new Error(`card-resolve ${res.status}`);
        const data = await res.json();
        // Object.entries rather than data.results[name]: a "__proto__" key
        // is an own property after JSON.parse, but indexing it reads the
        // prototype instead.
        const results: Record<string, { name?: unknown; suggestions?: unknown } | null> =
            data && typeof data.results === "object" && data.results ? data.results : {};
        for (const [asked, v] of Object.entries(results)) {
            if (typeof v?.name === "string") out.set(asked, { name: v.name });
            else if (v?.name === null) {
                out.set(asked, {
                    name: null,
                    suggestions: Array.isArray(v.suggestions)
                        ? v.suggestions.filter((s: unknown): s is string => typeof s === "string")
                        : [],
                });
            }
        }
    }
    return out;
}
