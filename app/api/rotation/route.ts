// app/api/rotation/route.ts

import { NextResponse } from "next/server";
import { extractQtyAndName } from "@/lib/deckParser";
import { normalizeName } from "@/lib/nameUtils";
import { lookupRotation, getRotationMeta } from "@/lib/standardRotation";
import { BASIC_LAND_NAMES } from "@/lib/basicLands";
import { lookupCard } from "@/lib/scryfall";

export async function POST(req: Request) {
    try {
        const { decklist } = await req.json();
        const text = Array.isArray(decklist) ? decklist.join("\n") : decklist ?? "";

        const lines: string[] = String(text)
            .split("\n")
            .map((l: string) => l.trim())
            .filter((l: string) => l.length > 0);

        // Dedupe by normalized name, summing quantities across the pasted
        // list — a rotation check only cares about each unique card once.
        const seen = new Map<string, { rawName: string; qty: number }>();

        for (const line of lines) {
            if (/^sideboard$/i.test(line)) continue;

            const parsed = extractQtyAndName(line);
            if (!parsed) continue;

            const { qty, rawName } = parsed;
            const key = normalizeName(rawName);

            // Basic lands are printed in nearly every set and always
            // Standard-legal — they're never meaningfully "rotating" or
            // "safe", just noise in the results.
            if (BASIC_LAND_NAMES.has(key)) continue;

            const current = seen.get(key);
            seen.set(key, { rawName: current?.rawName ?? rawName, qty: (current?.qty ?? 0) + qty });
        }

        const rotating: any[] = [];
        const safe: any[] = [];
        const notStandard: any[] = [];

        for (const { rawName, qty } of seen.values()) {
            const result = lookupRotation(rawName);

            if (!result.found) {
                // Not in the Standard-track dataset — still look the card up
                // against the full card database so the UI can show its art
                // and most recent printing's set, purely for visual context
                // (not implying Standard legality; this can be any format's
                // printing, e.g. a Commander-only or long-rotated card).
                const card = await lookupCard(rawName, false);
                notStandard.push({
                    card: rawName,
                    qty,
                    image: card?.failed ? null : (card?.image_uris?.normal ?? null),
                    lastPrintedSet: card?.failed ? null : (card?.set_name ?? null),
                    lastPrintedSetIcon: card?.failed ? null : (card?.set_icon_svg_uri ?? null),
                });
            } else if (result.survives) {
                safe.push({ card: rawName, qty, sets: result.sets, image: result.image });
            } else {
                rotating.push({ card: rawName, qty, sets: result.sets, image: result.image });
            }
        }

        return NextResponse.json({
            rotating,
            safe,
            notStandard,
            meta: getRotationMeta(),
        });
    } catch (err) {
        console.error("ROTATION ERROR:", err);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
