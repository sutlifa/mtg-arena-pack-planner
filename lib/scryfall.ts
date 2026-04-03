// lib/scryfall.ts

import fs from "fs";
import path from "path";
import { normalizeName } from "./nameUtils";
import { serverAliasMap } from "./serverAliasMap";

let cardData: any[] = [];
let cardMap: Record<string, any[]> = {}; // store arrays of printings
let loaded = false;

async function loadData() {
    if (loaded) return;

    const filePath = path.join(process.cwd(), "lib/data/cards-min.json");
    const fileContents = fs.readFileSync(filePath, "utf8");
    cardData = JSON.parse(fileContents);

    for (const card of cardData) {
        const key = normalizeName(card.name);
        if (!cardMap[key]) cardMap[key] = [];
        cardMap[key].push(card);
    }

    loaded = true;
}

export async function lookupCard(
    name: string,
    arenaMode = false
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

    // Display name depends on mode
    const displayName = arenaMode
        ? (selected.printed_name ?? selected.name)
        : selected.name;

    // Build both printings for UI toggle
    const arenaPrinting =
        printings.find(c => c.games?.includes("arena")) ?? null;

    let paperPrinting =
        printings.find(c => !c.games?.includes("arena")) ??
        arenaPrinting;

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
    };
}
