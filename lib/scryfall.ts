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

    console.log("LOOKUP DEBUG:", {
        input: name,
        normalized,
        alias,
        lookupKey,
        hasPrintings: !!printings,
        printingCount: printings?.length ?? 0,
        printingsPreview: printings?.map(p => ({
            name: p.name,
            printed_name: p.printed_name,
            set: p.set,
            games: p.games,
        })),
    });

    if (!printings || printings.length === 0) {
        return { failed: true };
    }

    // ⭐ NEW: detect if this card has ANY true paper printing
    const hasPaperPrinting = printings.some(c => !c.games?.includes("arena"));

    let selected;

    if (arenaMode) {
        // ⭐ Arena mode → prefer Arena printings (original working logic)
        selected =
            printings.find(c => c.games?.includes("arena")) ??
            printings[0];
    } else {
        if (hasPaperPrinting) {
            // ⭐ Paper mode → use real paper printing if it exists
            selected =
                printings.find(c => !c.games?.includes("arena")) ??
                printings[0];
        } else {
            // ⭐ Paper mode but NO paper printing exists (Ademi case)
            // → use Arena printing but with paper/oracle name
            selected = printings[0];
        }
    }

    // ⭐ Display name depends on mode
    const displayName = arenaMode
        ? (selected.printed_name ?? selected.name) // Arena name
        : selected.name;                           // Paper/oracle name

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

        raw: selected
    };
}
