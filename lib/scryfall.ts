// lib/scryfall.ts

import { normalizeName } from "./nameUtils";
import { serverAliasMap } from "./serverAliasMap";
import { getCardData } from "./cardDataStore";

const cardMap: Record<string, any[]> = {}; // store arrays of printings
let loaded = false;

async function loadData() {
    if (loaded) return;

    for (const card of getCardData()) {
        const key = normalizeName(card.name);
        if (!cardMap[key]) cardMap[key] = [];
        cardMap[key].push(card);
    }

    loaded = true;
}

export interface PrintingOverride {
    set: string;
    collector_number: string;
}

export async function lookupCard(
    name: string,
    arenaMode = false,
    printingOverride?: PrintingOverride
): Promise<any> {

    await loadData();

    const normalized = normalizeName(name);
    const alias = serverAliasMap[normalized];
    const lookupKey = alias ?? normalized;

    const printings = cardMap[lookupKey];

    if (!printings || printings.length === 0) {
        return { failed: true };
    }

    // Detect if this card has a genuine paper printing — must actually
    // include "paper" in games, not just "isn't Arena". An MTGO-exclusive
    // printing (games: ["mtgo"]) is neither Arena nor paper, but would
    // wrongly pass a `!games.includes("arena")` check and get treated as
    // the paper printing.
    const hasPaperPrinting = printings.some(c => c.games?.includes("paper"));

    let selected;

    if (arenaMode) {
        // Arena mode → prefer Arena printings. Falls back to printings[0]
        // only so there's still a name/id to work with when nothing is
        // Arena-legal — callers must check `availableOnArena` before
        // trusting this printing's set/rarity/price, since none of that is
        // meaningful for a card that doesn't actually exist on Arena.
        selected =
            printings.find(c => c.games?.includes("arena")) ??
            printings[0];
    } else {
        if (hasPaperPrinting) {
            // Paper mode → use real paper printing if it exists
            selected =
                printings.find(c => c.games?.includes("paper")) ??
                printings[0];
        } else {
            // Paper mode but NO true paper printing exists — same caveat as
            // the Arena fallback above; check `availableInPaper`.
            selected = printings[0];
        }
    }

    // Build both printings for UI toggle
    let arenaPrinting =
        printings.find(c => c.games?.includes("arena")) ?? null;

    // Strictly "games includes paper" — never falls back to an
    // MTGO/Arena-only printing just because it isn't tagged Arena.
    let paperPrinting =
        printings.find(c => c.games?.includes("paper")) ?? null;

    // Every alt-art/version option for this card (see scripts/build-cards.js
    // — attached to just one of the paper/arena/mtgo entries, so check them
    // all rather than only `selected`).
    const versions: any[] = printings.find((c) => c.printings)?.printings ?? [];

    // If the caller picked a specific printing, swap it in for whichever
    // side of arenaPrinting/paperPrinting it actually belongs to.
    if (printingOverride) {
        const match = versions.find(
            (v) =>
                v.set === printingOverride.set &&
                v.collector_number === printingOverride.collector_number
        );

        if (match) {
            // A printing can legitimately belong to more than one mode
            // (e.g. released simultaneously in paper and Arena) — update
            // whichever of these it actually covers, not just one. Strictly
            // "games includes paper" here too, so an MTGO-only override
            // match can't masquerade as the paper printing.
            if (match.games?.includes("arena")) {
                arenaPrinting = { ...match };
            }
            if (match.games?.includes("paper")) {
                paperPrinting = { ...match };
            }

            // Only drive `selected` (and therefore set/rarity/price, which
            // feed pricing, wildcards, and set recommendations) from this
            // match if it's actually valid for the mode being queried right
            // now — a paper-only override picked while in Paper Mode
            // shouldn't leak into an Arena Mode analysis (that printing
            // isn't obtainable there) just because the choice is still
            // remembered.
            const validForMode = arenaMode
                ? match.games?.includes("arena")
                : match.games?.includes("paper");

            if (validForMode) {
                selected = { ...selected, ...match };
            }
        }
    }

    // Computed after the override above so a picked printing that fills in
    // a previously-missing side is reflected correctly.
    const availableOnArena = arenaPrinting !== null;
    const availableInPaper = paperPrinting !== null;

    // Display name depends on mode
    const displayName = arenaMode
        ? (selected.printed_name ?? selected.name)
        : selected.name;

    // ⭐ NORMALIZE PAPER PRINTING NAME
    // If printed_name is missing, empty, or lowercase junk → use oracle name
    if (paperPrinting) {
        const pn = paperPrinting.printed_name;
        const needsFix =
            !pn ||
            pn.trim() === "" ||
            pn.toLowerCase() === pn; // lowercase = bad for your custom set

        paperPrinting = {
            ...paperPrinting,
            printed_name: needsFix ? paperPrinting.name : pn,
        };
    }

    return {
        failed: false,

        // canonical oracle name
        name: selected.name,

        // mode-appropriate display name
        printed_name: displayName,

        // metadata
        arena_name: selected.arena_name ?? null,
        image_uris: selected.image_uris ?? null,
        set: selected.set ?? null,
        set_name: selected.set_name ?? null,
        collector_number: selected.collector_number ?? null,
        set_icon_svg_uri: selected.set_icon_svg_uri ?? null,
        rarity: selected.rarity ?? null,

        raw: selected,

        // ⭐ BOTH PRINTINGS — with normalized paper printing
        arenaPrinting,
        paperPrinting,

        // Whether this card actually has an Arena/paper printing at all —
        // callers must check these before trusting set/rarity/price above,
        // since `selected` falls back to *some* printing (paper or MTGO)
        // even when the mode being queried has nothing real to show.
        availableOnArena,
        availableInPaper,

        // Every selectable alt-art/version option, for the art picker.
        versions,
    };
}
