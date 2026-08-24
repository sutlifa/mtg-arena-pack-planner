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

    // Detect if this card has ANY true paper printing
    const hasPaperPrinting = printings.some(c => !c.games?.includes("arena"));

    let selected;

    if (arenaMode) {
        // Arena mode → prefer Arena printings
        selected =
            printings.find(c => c.games?.includes("arena")) ??
            printings[0];
    } else {
        if (hasPaperPrinting) {
            // Paper mode → use real paper printing if it exists
            selected =
                printings.find(c => !c.games?.includes("arena")) ??
                printings[0];
        } else {
            // Paper mode but NO paper printing exists
            selected = printings[0];
        }
    }

    // Build both printings for UI toggle
    let arenaPrinting =
        printings.find(c => c.games?.includes("arena")) ?? null;

    let paperPrinting =
        printings.find(c => !c.games?.includes("arena")) ??
        arenaPrinting;

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
            // whichever of these it actually covers, not just one.
            if (match.games?.includes("arena")) {
                arenaPrinting = { ...match };
            }
            if (match.games?.includes("paper") || match.games?.includes("mtgo")) {
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
                : match.games?.includes("paper") || match.games?.includes("mtgo");

            if (validForMode) {
                selected = { ...selected, ...match };
            }
        }
    }

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

        // Every selectable alt-art/version option, for the art picker.
        versions,
    };
}
