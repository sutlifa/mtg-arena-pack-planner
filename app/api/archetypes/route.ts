// app/api/archetypes/route.ts

import { NextResponse } from "next/server";
import { goldfishFetch, readCappedText } from "@/lib/goldfishFetch";
import { isSupportedFormat, MAX_ARCHETYPES } from "@/lib/formats";

/** The metagame page is large but bounded; well under this in practice. */
const MAX_RESPONSE_BYTES = 4_000_000;

/**
 * Decodes the HTML entities MTGGoldfish emits in archetype names — without
 * this, "Goryo&#39;s Vengeance" reaches the UI verbatim.
 */
function decodeEntities(s: string): string {
    return s
        .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
        .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
}

export interface Archetype {
    name: string;
    pct: number | null;
}

/**
 * Pulls archetype names and metagame share out of a MTGGoldfish metagame
 * page.
 *
 * This is scraping, so it is written to degrade rather than explode: if the
 * markup changes the result is an empty list and the UI falls back to letting
 * the user type archetypes in by hand, which is a supported path anyway.
 */
function parseArchetypes(html: string): Archetype[] {
    const out: Archetype[] = [];
    const seen = new Set<string>();

    for (const chunk of html.split("<div class='archetype-tile' ").slice(1)) {
        const nameMatch = chunk.match(
            /<span class='deck-price-paper'>\s*<a href="\/archetype\/[^"]*">([^<]+)<\/a>/
        );
        if (!nameMatch) continue;

        const name = decodeEntities(nameMatch[1]).trim();
        if (!name) continue;

        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        const pctMatch = chunk.match(/metagame-percentage'>[\s\S]*?([\d.]+)%/);

        out.push({ name, pct: pctMatch ? parseFloat(pctMatch[1]) : null });
    }

    return out;
}

export async function POST(req: Request) {
    try {
        const { format, limit } = await req.json();

        if (!isSupportedFormat(format)) {
            return NextResponse.json({ error: "Unsupported format" }, { status: 400 });
        }

        const count = Math.max(1, Math.min(MAX_ARCHETYPES, Number(limit) || 1));

        // `/full` lists the whole metagame rather than just the featured
        // tiles, which is what makes 25 archetypes reachable — the plain
        // /metagame/<format> page stops at 15.
        const res = await goldfishFetch(
            `https://www.mtggoldfish.com/metagame/${format}/full`
        );

        if (!res || !res.ok) {
            return NextResponse.json(
                { error: "Couldn't reach MTGGoldfish for the current metagame" },
                { status: 502 }
            );
        }

        const html = await readCappedText(res, MAX_RESPONSE_BYTES);
        if (!html) {
            return NextResponse.json(
                { error: "Couldn't reach MTGGoldfish for the current metagame" },
                { status: 502 }
            );
        }

        const all = parseArchetypes(html);

        if (all.length === 0) {
            return NextResponse.json(
                { error: "Couldn't read the metagame list — add archetypes manually below." },
                { status: 502 }
            );
        }

        return NextResponse.json({
            format,
            archetypes: all.slice(0, count),
            available: all.length,
        });
    } catch (err) {
        console.error("ARCHETYPES ERROR:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
