// app/api/archetypes/route.ts

import { NextResponse } from "next/server";
import { goldfishFetch, readCappedText } from "@/lib/goldfishFetch";
import { readJsonBody } from "@/lib/requestBody";
import {
    isSupportedFormat,
    isMetaPeriod,
    DEFAULT_META_PERIOD,
    MAX_ARCHETYPES,
    type MetaPeriod,
} from "@/lib/formats";

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
    /**
     * The archetype's MTGGoldfish page. The Sideboard Planner loads its
     * featured decklist to show what you're boarding against.
     */
    url: string | null;
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
            /<span class='deck-price-paper'>\s*<a href="\/archetype\/([^"#?]*)[^"]*">([^<]+)<\/a>/
        );
        if (!nameMatch) continue;

        const name = decodeEntities(nameMatch[2]).trim();
        if (!name) continue;

        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        const pctMatch = chunk.match(/metagame-percentage'>[\s\S]*?([\d.]+)%/);

        // The slug is only ever used to build a mtggoldfish.com URL, and
        // /api/import-deck re-checks the host before fetching it anyway.
        const slug = nameMatch[1];
        const url = /^[a-z0-9-]+$/i.test(slug)
            ? `https://www.mtggoldfish.com/archetype/${slug}`
            : null;

        out.push({ name, pct: pctMatch ? parseFloat(pctMatch[1]) : null, url });
    }

    return out;
}

/** The first capture of `pattern` in `html`, entity-decoded. */
function attr(html: string, pattern: RegExp): string | null {
    const m = html.match(pattern);
    return m ? decodeEntities(m[1]) : null;
}

/**
 * The metagame page for one format, over the last `period` days.
 *
 * The default 30 days is just the page. Any other window isn't in the URL:
 * MTGGoldfish's "Show decks from the last N days" dropdown submits a form
 * (POST /metagame/re_sort) and gets the tiles back as a Turbo Stream. So this
 * does what the dropdown does — load the page for its session cookie and
 * CSRF token, then post the form with the chosen period. The tiles in that
 * response are the same markup the page uses, so one parser reads both.
 *
 * Returns null on any failure. There is deliberately no fallback to the
 * 30-day list: quietly showing a different window than the one asked for
 * would put wrong percentages on someone's guide.
 */
async function fetchMetagameHtml(format: string, period: MetaPeriod): Promise<string | null> {
    // `/full` lists the whole metagame rather than just the featured
    // tiles, which is what makes 50 archetypes reachable — the plain
    // /metagame/<format> page stops at 15.
    const pageUrl = `https://www.mtggoldfish.com/metagame/${format}/full`;
    const page = await goldfishFetch(pageUrl);
    if (!page || !page.ok) return null;

    const html = await readCappedText(page, MAX_RESPONSE_BYTES);
    if (!html || period === DEFAULT_META_PERIOD) return html;

    // Rails pairs the CSRF token with the session cookie it was issued
    // alongside; either one alone gets a 422.
    const session = page.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .find((c) => c.startsWith("_mtg_session="));
    const token = attr(html, /<meta name="csrf-token" content="([^"]+)"/);
    // e.g. "standard|woe_eoe" — which sets are legal, so it changes with
    // rotation and has to be read off the page rather than hard-coded.
    // Formats without one (Modern, Legacy...) render the input with no value
    // attribute at all, which is an empty subformat, not a missing form.
    const subformatInput = html.match(/<input[^>]*name="subformat"[^>]*>/)?.[0];
    const subformat = subformatInput ? (attr(subformatInput, /value="([^"]*)"/) ?? "") : null;
    if (!session || !token || subformat === null) return null;

    const form = new URLSearchParams({
        authenticity_token: token,
        period: String(period),
        mformat: format,
        subformat,
        page: "",
        // Tabletop vs MTGO only changes which price the tiles show; META%
        // is identical either way.
        type: "paper",
        full: "1",
    });

    const res = await goldfishFetch("https://www.mtggoldfish.com/metagame/re_sort", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "text/vnd.turbo-stream.html, text/html",
            Cookie: session,
            "X-CSRF-Token": token,
            Origin: "https://www.mtggoldfish.com",
            Referer: pageUrl,
        },
        body: form.toString(),
    });
    if (!res || !res.ok) return null;

    return readCappedText(res, MAX_RESPONSE_BYTES);
}

export async function POST(req: Request) {
    try {
        const body = await readJsonBody(req);
        if (!body) {
            return NextResponse.json({ error: "Bad request" }, { status: 400 });
        }
        const { format, limit, period: rawPeriod } = body;

        if (!isSupportedFormat(format)) {
            return NextResponse.json({ error: "Unsupported format" }, { status: 400 });
        }

        // Missing means the default, as it did before periods existed;
        // anything present has to be one of MTGGoldfish's own choices.
        const period = rawPeriod === undefined ? DEFAULT_META_PERIOD : rawPeriod;
        if (!isMetaPeriod(period)) {
            return NextResponse.json({ error: "Unsupported time frame" }, { status: 400 });
        }

        const count = Math.max(1, Math.min(MAX_ARCHETYPES, Number(limit) || 1));

        const html = await fetchMetagameHtml(format, period);
        if (!html) {
            return NextResponse.json(
                { error: `Couldn't get the last ${period} days of the metagame from MTGGoldfish` },
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
            period,
            archetypes: all.slice(0, count),
            available: all.length,
        });
    } catch (err) {
        console.error("ARCHETYPES ERROR:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
