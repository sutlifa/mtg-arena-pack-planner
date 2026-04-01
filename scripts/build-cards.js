const fs = require("fs");
const path = require("path");
const https = require("https");
const JSONStream = require("JSONStream");

// Fetch JSON helper
async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed fetch ${url}: ${res.status} ${res.statusText}`);
    return res.json();
}

// Stream the giant all-cards JSON array
function streamAllCards(downloadUrl, onCard) {
    return new Promise((resolve, reject) => {
        https.get(downloadUrl, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`Failed to stream all-cards: ${res.statusCode}`));
                return;
            }

            const parser = JSONStream.parse("*");

            parser.on("data", onCard);
            parser.on("end", resolve);
            parser.on("error", reject);

            res.pipe(parser);
        }).on("error", reject);
    });
}

// Normalize dual-face cards (Adventure, OMEN, MDFC)
function normalizeFaces(card, setIconMap) {
    if (!card.card_faces) return card;

    const canonicalFace = card.card_faces[0];

    // Canonical name = front face name
    card.name = canonicalFace.name;

    // Copy set metadata to faces
    for (const face of card.card_faces) {
        face.set = card.set;
        face.set_name = card.set_name;
        face.set_type = card.set_type;
        face.collector_number = card.collector_number;
        face.set_icon_svg_uri = setIconMap[card.set?.toLowerCase()] ?? null;
    }

    return card;
}

async function run() {
    console.log("Fetching Scryfall bulk-data list...");
    const bulkList = await fetchJson("https://api.scryfall.com/bulk-data");

    const allCardsEntry = bulkList.data.find((b) => b.type === "all_cards");
    if (!allCardsEntry) throw new Error("Could not find all-cards bulk entry");

    console.log("Downloading Scryfall set metadata...");
    const setsJson = await fetchJson("https://api.scryfall.com/sets");

    const setIconMap = {};
    for (const s of setsJson.data) {
        if (s.code && s.icon_svg_uri) {
            setIconMap[s.code.toLowerCase()] = s.icon_svg_uri;
        }
    }

    console.log("Streaming all-cards JSON and filtering...");
    const best = {}; // { cardName: { paper, arena, mtgo } }

    await streamAllCards(allCardsEntry.download_uri, (card) => {
        // ENGLISH ONLY
        if (card.lang !== "en") return;

        // 🔥 FILTER A: Skip promos, Secret Lair, The List, Masterpieces, etc.
        if (
            card.promo === true ||
            card.set_type === "promo" ||
            card.set_type === "memorabilia" ||
            card.set_type === "token" ||
            card.set_type === "funny" ||
            card.set_type === "alchemy" ||
            card.set_type === "arsenal" ||
            card.set_type === "starter" ||
            card.set_type === "box" ||
            card.set_type === "masterpiece" ||
            card.set === "slx" ||
            card.set_name?.toLowerCase().includes("secret lair") ||
            card.set_name === "The List"
        ) {
            return;
        }

        // 🔥 FILTER B: Skip alternate-frame variants AND all promo variants
        if (
            card.frame_effects?.includes("extendedart") ||
            card.frame_effects?.includes("showcase") ||
            card.frame_effects?.includes("etched") ||
            card.frame_effects?.includes("inverted") ||      // NEW
            card.border_color === "borderless" ||
            card.full_art === true ||
            (card.promo_types && card.promo_types.length > 0) // NEW: skip ALL promo variants
        ) {
            return;
        }
          
              // 🔥 FILTER C: Skip TSR Timeshifted retro-frame cards
        if (
            card.set === "tsr" &&
            (card.rarity === "special" || card.frame === "1997")
        ) {
            return;
        }

        // 🔥 FILTER D: Skip Mystery Booster Playtest Cards (MB1/MB2)
        if (card.set === "mb1" || card.set === "mb2") {
            return;
        }

        // Normalize dual-face cards (Adventure, OMEN, MDFC)
        if (card.layout === "adventure" || card.layout === "modal_dfc" || card.card_faces) {
            card = normalizeFaces(card, setIconMap);
        }

        const name = card.name;

        if (!best[name]) best[name] = { paper: null, arena: null, mtgo: null };

    
        // Skip Commander printings if a non-Commander printing exists
        const isCommander = card.set_type === "commander";

        const update = (slot) => {
            const existing = best[name][slot];

            // If existing is non-commander and new is commander → skip
            if (existing && existing.set_type !== "commander" && isCommander) {
                return;
            }

            // If existing is commander and new is non-commander → replace
            if (existing && existing.set_type === "commander" && !isCommander) {
                best[name][slot] = card;
                return;
            }

            // Otherwise: pick newest
            if (!existing || (card.released_at && card.released_at > existing.released_at)) {
                best[name][slot] = card;
            }
        };

        // Apply to all game modes
        if (card.games?.includes("paper")) update("paper");
        if (card.games?.includes("arena")) update("arena");
        if (card.games?.includes("mtgo")) update("mtgo");
    });

    console.log("Building final filtered dataset...");
    const final = [];

    for (const name of Object.keys(best)) {
        const slots = best[name];
        for (const slot of ["paper", "arena", "mtgo"]) {
            const card = slots[slot];
            if (!card) continue;

            const base = {
                name: card.name,
                printed_name: card.printed_name,
                arena_name: card.arena_name,
                set: card.set,
                set_name: card.set_name,
                set_type: card.set_type,
                collector_number: card.collector_number,
                rarity: card.rarity,
                released_at: card.released_at,
                games: card.games,
                set_icon_svg_uri: setIconMap[card.set?.toLowerCase()] ?? null,
            };

            if (card.image_uris?.normal) {
                base.image_uris = { normal: card.image_uris.normal };
            }

            if (card.card_faces) {
                base.card_faces = card.card_faces.map((face) => ({
                    name: face.name,
                    printed_name: face.printed_name,
                    image_uris: face.image_uris?.normal
                        ? { normal: face.image_uris.normal }
                        : card.image_uris?.normal
                            ? { normal: card.image_uris.normal }
                            : undefined,
                    set: face.set,
                    set_name: face.set_name,
                    set_type: face.set_type,
                    collector_number: face.collector_number,
                    set_icon_svg_uri: face.set_icon_svg_uri,
                }));
            }

            final.push(base);
        }
    }

    console.log(`Final dataset size: ${final.length} cards. Writing output...`);

    const libDir = path.join(process.cwd(), "lib/data");
    const publicDir = path.join(process.cwd(), "public/data");
    if (!fs.existsSync(libDir)) fs.mkdirSync(libDir, { recursive: true });
    if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

    const libPath = path.join(libDir, "cards-min.json");
    const publicPath = path.join(publicDir, "cards-min.json");

    fs.writeFileSync(libPath, JSON.stringify(final));
    fs.writeFileSync(publicPath, JSON.stringify(final));

    const sizeMB = (fs.statSync(libPath).size / 1024 / 1024).toFixed(2);
    console.log(`Done. Wrote ${final.length} cards (${sizeMB} MB)`);
}

run().catch((e) => {
    console.error(e);
    process.exit(1);
});