const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const readline = require("readline");
const { Readable } = require("stream");

// Fetch JSON helper (patched with User-Agent)
async function fetchJson(url) {
    const res = await fetch(url, {
        headers: {
            "User-Agent": "MTG Arena Pack Planner (GitHub Actions)"
        }
    });

    if (!res.ok) throw new Error(`Failed fetch ${url}: ${res.status} ${res.statusText}`);
    return res.json();
}

// Minimal retry wrapper (ONLY used for bulk-data)
async function fetchJsonRetry(url, retries = 4) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fetchJson(url);
        } catch (err) {
            if (i === retries - 1) throw err;
            await new Promise(r => setTimeout(r, 500 * (i + 1))); // small backoff
        }
    }
}

// Stream the giant all-cards bulk file.
// Scryfall now serves bulk data as gzip-compressed JSON Lines
// (one card object per line) via `jsonl_download_uri`, not a plain
// JSON array via `download_uri` (that field no longer exists).
async function streamAllCards(downloadUrl, onCard) {
    if (!downloadUrl) {
        throw new Error("streamAllCards: downloadUrl is missing/empty");
    }

    const res = await fetch(downloadUrl, {
        headers: {
            "User-Agent": "MTG Arena Pack Planner (GitHub Actions)"
        }
    });

    if (!res.ok || !res.body) {
        throw new Error(`Failed to stream all-cards: ${res.status} ${res.statusText}`);
    }

    const gunzip = zlib.createGunzip();
    const lines = readline.createInterface({
        input: Readable.fromWeb(res.body).pipe(gunzip),
        crlfDelay: Infinity,
    });

    for await (const line of lines) {
        if (!line) continue;
        onCard(JSON.parse(line));
    }
}

const NUMBER_WORDS = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
    nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
    fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
    twenty: 20,
};

function wordToNumber(word) {
    const n = NUMBER_WORDS[word.toLowerCase()];
    if (n != null) return n;
    const parsed = parseInt(word, 10);
    return Number.isFinite(parsed) ? parsed : null;
}

// A handful of cards override the normal "max 4 copies" deckbuilding rule
// in their own rules text (e.g. Relentless Rats: "A deck can have any
// number of cards named Relentless Rats"; Nazgûl: "...up to nine cards
// named Nazgûl"). Detect that from oracle text so the app can allow more
// than 4 copies for exactly these cards, driven by real card data instead
// of a hardcoded list.
// Returns: null = unlimited, a number = "up to N", undefined = no override.
function detectDeckLimit(card) {
    const text =
        card.oracle_text ||
        (card.card_faces ? card.card_faces.map((f) => f.oracle_text || "").join("\n") : "");

    if (!text) return undefined;

    if (/a deck can have any number of cards named/i.test(text)) {
        return null;
    }

    const upTo = text.match(/a deck can have up to (\w+) cards named/i);
    if (upTo) {
        const n = wordToNumber(upTo[1]);
        if (n) return n;
    }

    return undefined;
}

// Maximum alternate printings retained per card name, for the art/version
// picker. Popular staples can have 50+ reprints; capping keeps the dataset
// size sane. Newest first, so this keeps the most currently-relevant ones.
const MAX_PRINTINGS_PER_CARD = 24;

// Real numbered sets that were never sold at normal retail — recalled
// misprint runs, store-exclusive prize support, etc. — so a card's "best"
// printing shouldn't be able to land on one of these just because it
// happens to have a late release date. (Summer Magic in particular was an
// immediately-recalled Revised misprint with as few as ~90 copies of some
// cards; picking it over Revised as "the current paper printing" would be
// actively misleading.) Set_type alone can't distinguish these from a
// normal core set, so they're called out by code.
const NON_RETAIL_SETS = new Set(["sum", "ced", "cei"]); // Summer Magic/Edgar, Collectors' Edition, Intl. Collectors' Edition

// --- Standard rotation feature -------------------------------------------
//
// Wizards changed Standard's rotation schedule starting in 2027: instead of
// rotating every autumn, it now rotates with the first premier set of the
// calendar year. The next rotation lands with Nauctis: The Sunken Realm,
// which sends Wilds of Eldraine, The Lost Caverns of Ixalan, Murders at
// Karlov Manor, The Big Score, Outlaws of Thunder Junction, Bloomburrow, and
// Duskmourn: House of Horror out of the format.
//
// STANDARD_TRACK_SETS is the full pool of sets currently — or about to be,
// before the Feb 2027 rotation — Standard-legal. This can't be derived
// automatically from Scryfall's per-card `legalities.standard` field: that
// field reflects whether the CARD is legal via ANY of its printings, not
// whether a SPECIFIC printing's set is part of the current pool. A 2006
// Guildpact printing of a card shows "legal" too, once that same card gets
// a Foundations reprint — so it can't be used to tell which sets actually
// grant Standard legality. This has to be maintained by hand instead.
//
// None of this is derivable from card data on its own, so update these two
// constants by hand: add newly-released/announced sets to
// STANDARD_TRACK_SETS as Wizards reveals them (roughly every ~2 months),
// and when the Feb 2027 rotation actually happens, drop ROTATING_OUT_SETS'
// members from STANDARD_TRACK_SETS and move ROTATION_DATE / ROTATING_OUT_SETS
// forward to whatever rotates in 2028.
const ROTATION_DATE = "2027-02-05"; // Nauctis: The Sunken Realm release — the 2027 rotation trigger
const ROTATING_OUT_SETS = new Set(["woe", "lci", "mkm", "big", "otj", "blb", "dsk"]);
const STANDARD_TRACK_SETS = new Set([
    // Rotating out Feb 2027
    "woe", "lci", "mkm", "big", "otj", "blb", "dsk",
    // Surviving rotation (includes sets previewing now but not yet released —
    // listing them here lets already-spoiled cards count as safe ahead of
    // their release day)
    "fdn", "dft", "tdm", "fin", "eoe", "om1", "spm", "tla",
    "ecl", "tmt", "sos", "msh", "hob", "fra", "trk",
]);

// A short human label for why a printing looks different from the plain
// version, so the art picker can show e.g. "Showcase" or "Borderless"
// instead of just a bare set name.
function detectVariant(card) {
    const labels = [];
    if (card.frame_effects?.includes("extendedart")) labels.push("Extended Art");
    if (card.frame_effects?.includes("showcase")) labels.push("Showcase");
    if (card.frame_effects?.includes("etched")) labels.push("Etched Foil");
    if (card.frame_effects?.includes("inverted")) labels.push("Inverted");
    if (card.full_art === true) labels.push("Full Art");
    if (card.border_color === "borderless") labels.push("Borderless");
    if (card.promo === true && card.promo_types?.includes("universesbeyond")) {
        labels.push("Universes Beyond");
    }
    return labels.length ? labels.join(" · ") : null;
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
    const bulkList = await fetchJsonRetry("https://api.scryfall.com/bulk-data");

    const allCardsEntry = bulkList.data.find((b) => b.type === "all_cards");
    if (!allCardsEntry) throw new Error("Could not find all-cards bulk entry");

    console.log("Downloading Scryfall set metadata...");
    const setsJson = await fetchJson("https://api.scryfall.com/sets");

    const setIconMap = {};
    const setInfoMap = {}; // code -> { name } — used by the rotation dataset for set display names
    for (const s of setsJson.data) {
        if (s.code && s.icon_svg_uri) {
            setIconMap[s.code.toLowerCase()] = s.icon_svg_uri;
        }
        if (s.code) {
            setInfoMap[s.code.toLowerCase()] = { name: s.name };
        }
    }

    console.log("Streaming all-cards JSON and filtering...");
    const best = {}; // { cardName: { paper, arena, mtgo } }
    const allPrintings = {}; // { cardName: [ printing, ... ] } — every eligible printing, for the art/version picker
    const rotationIndex = {}; // { cardName: Map<setCode, {set, set_name, rotating}> } — for the Standard rotation checker

    // Scryfall's bulk data includes preview/spoiler cards for sets that
    // haven't released yet (there is no boolean flag for this — released_at
    // is the only tag available, and it's a future date for those cards).
    // Skip them: they have no price data yet, and — since printings are
    // otherwise picked by "newest released_at wins" below — an unreleased
    // preview would otherwise incorrectly outrank the real, live printing.
    const today = new Date().toISOString().slice(0, 10);

    await streamAllCards(allCardsEntry.jsonl_download_uri, (card) => {
        // ENGLISH ONLY
        if (card.lang !== "en") return;

        // Standard rotation index: record, for every card with a printing
        // in one of the fixed Standard-track sets above, which of those
        // sets it appears in — regardless of release date, so a card
        // already spoiled for an unreleased set (e.g. Star Trek) counts as
        // safe ahead of its release day. Deliberately runs before FILTER 0
        // below, which would otherwise skip unreleased preview cards
        // entirely.
        {
            const setCode = card.set?.toLowerCase();

            if (setCode && STANDARD_TRACK_SETS.has(setCode)) {
                const rotName = card.card_faces?.[0]?.name ?? card.name;
                if (!rotationIndex[rotName]) {
                    rotationIndex[rotName] = { sets: new Map(), image: null, imageDate: null };
                }
                const entry = rotationIndex[rotName];

                if (!entry.sets.has(setCode)) {
                    entry.sets.set(setCode, {
                        set: setCode,
                        set_name: setInfoMap[setCode]?.name ?? card.set_name,
                        set_icon_svg_uri: setIconMap[setCode] ?? null,
                        rotating: ROTATING_OUT_SETS.has(setCode),
                    });
                }

                // Keep a representative thumbnail — the newest printing seen
                // among the Standard-track sets — for the rotation checker's
                // card rows.
                const thumb = card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal;
                if (thumb && (!entry.imageDate || (card.released_at && card.released_at > entry.imageDate))) {
                    entry.image = thumb;
                    entry.imageDate = card.released_at ?? entry.imageDate;
                }
            }
        }

        // 🔥 FILTER 0: Skip cards that haven't released yet
        if (!card.released_at || card.released_at > today) return;

        // 🔥 FILTER A: Promo logic
        // Allow ONLY Universes Beyond promos (OM1 paper printings)
        if (card.promo === true) {
            if (!card.promo_types || !card.promo_types.includes("universesbeyond")) {
                return; // skip all other promos
            }
        }

        // Skip unwanted set types.
        //
        // Wizards increasingly reuses old-timey/promotional set treatments
        // to deliver genuinely current, Arena/MTGO-legal cards — "Special
        // Guests" bonus sheets are set_type "masterpiece", some Explorer/
        // historic reprint waves show up under "duel_deck", Modern Horizons
        // is "draft_innovation". Guessing which set NAMES are "really"
        // retail by set_type alone keeps getting proven wrong (Magus of the
        // Moon's only Arena printing is a "masterpiece"-type Special Guests
        // card; Snuff Out's is a "duel_deck"-type Duel Decks Anthology
        // card). So for this batch of "supplemental product" types, trust
        // the card's own `games` tag instead: only exclude a printing here
        // if it ISN'T actually available on Arena or MTGO. A printing
        // Scryfall says is digitally available is real and obtainable,
        // regardless of what the set looks like.
        //
        // Alchemy is the one deliberate exception, kept excluded outright —
        // its digital-only rebalances share a name with the original card
        // but have different rules text, and letting them in would corrupt
        // "same name, pick the newest" logic elsewhere in this file.
        // Memorabilia/token/funny aren't real constructed cards regardless
        // of any games tag.
        const isDigitallyAvailable = card.games?.includes("arena") || card.games?.includes("mtgo");

        const alwaysExcludedType =
            card.set_type === "memorabilia" ||
            card.set_type === "token" ||
            card.set_type === "funny" ||
            card.set_type === "alchemy";

        const supplementalProductType =
            card.set_type === "arsenal" ||
            card.set_type === "starter" ||
            card.set_type === "box" ||
            card.set_type === "masterpiece" ||
            card.set_type === "duel_deck" ||
            card.set_type === "premium_deck" ||
            card.set_type === "treasure_chest" ||
            card.set_type === "planechase" ||
            card.set_type === "archenemy" ||
            card.set_type === "vanguard" ||
            card.set_type === "from_the_vault" ||
            card.set_type === "spellbook" ||
            card.set_type === "minigame";

        if (
            alwaysExcludedType ||
            (supplementalProductType && !isDigitallyAvailable) ||
            card.set === "slx" ||
            NON_RETAIL_SETS.has(card.set?.toLowerCase()) ||
            card.set_name?.toLowerCase().includes("secret lair") ||
            card.set_name === "The List"
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

        // 🔥 FILTER B: alternate-frame variants (extended art, showcase,
        // full art, etc.) are deprioritized for the *default* pick below —
        // a normal-frame printing always wins over one regardless of
        // release date — but can still become the default if that's the
        // ONLY printing this card has for a given game mode. Without that
        // fallback, a card whose only Arena printing happens to be alt-frame
        // (Special Guests bonus-sheet reprints, notably — full_art: true)
        // would end up with no Arena slot at all, incorrectly reporting as
        // not available on Arena. Every alt-frame printing is also recorded
        // in allPrintings regardless — that's exactly the alt-art content
        // the version picker exists to offer.
        const isAltFrame = (c) =>
            c.frame_effects?.includes("extendedart") ||
            c.frame_effects?.includes("showcase") ||
            c.frame_effects?.includes("etched") ||
            c.frame_effects?.includes("inverted") ||
            c.full_art === true;

        {
            if (!best[name]) best[name] = { paper: null, arena: null, mtgo: null };

            const cardIsAltFrame = isAltFrame(card);
            const isCommander = card.set_type === "commander";

            const update = (slot) => {
                const existing = best[name][slot];

                if (!existing) {
                    best[name][slot] = card;
                    return;
                }

                const existingIsAltFrame = isAltFrame(existing);

                // A normal-frame printing always wins over an alt-frame one.
                if (existingIsAltFrame && !cardIsAltFrame) {
                    best[name][slot] = card;
                    return;
                }
                if (!existingIsAltFrame && cardIsAltFrame) {
                    return;
                }

                // Skip Commander printings if a non-Commander printing exists
                if (existing.set_type !== "commander" && isCommander) {
                    return;
                }

                // If existing is commander and new is non-commander → replace
                if (existing.set_type === "commander" && !isCommander) {
                    best[name][slot] = card;
                    return;
                }

                // Otherwise: pick newest
                if (card.released_at && card.released_at > existing.released_at) {
                    best[name][slot] = card;
                }
            };

            // Apply to all game modes
            if (card.games?.includes("paper")) update("paper");
            if (card.games?.includes("arena")) update("arena");
            if (card.games?.includes("mtgo")) update("mtgo");
        }

        // Record every eligible printing (including alt-frame ones) for the
        // art/version picker.
        if (!allPrintings[name]) allPrintings[name] = [];
        allPrintings[name].push({
            name: card.name,
            set: card.set,
            set_name: card.set_name,
            set_type: card.set_type,
            collector_number: card.collector_number,
            rarity: card.rarity,
            released_at: card.released_at,
            games: card.games,
            set_icon_svg_uri: setIconMap[card.set?.toLowerCase()] ?? null,
            prices_usd: card.prices?.usd ?? card.prices?.usd_foil ?? null,
            printed_name: card.printed_name,
            variant: detectVariant(card),
            image_uris: card.image_uris?.normal ? { normal: card.image_uris.normal } : undefined,
            card_faces: card.card_faces
                ? card.card_faces.map((face) => ({
                    name: face.name,
                    printed_name: face.printed_name,
                    image_uris: face.image_uris?.normal
                        ? { normal: face.image_uris.normal }
                        : card.image_uris?.normal
                            ? { normal: card.image_uris.normal }
                            : undefined,
                }))
                : undefined,
        });
    });

    console.log("Building final filtered dataset...");

    // Newest first, capped, per card name — used to populate each card's
    // `printings` (the art/version picker options).
    for (const name of Object.keys(allPrintings)) {
        const list = allPrintings[name];
        list.sort((a, b) => (b.released_at || "").localeCompare(a.released_at || ""));

        // Always keep the auto-selected default printing(s) for this card
        // (best[name].paper/arena/mtgo), even if newer alt-art variants
        // would otherwise push them out of the cap — the "no override
        // chosen" case relies on the picker's default landing on exactly
        // the same printing pricing/wildcards were computed from.
        const isSame = (a, b) => a.set === b.set && a.collector_number === b.collector_number;
        const pinned = [];
        const slots = best[name];
        if (slots) {
            for (const slot of ["paper", "arena", "mtgo"]) {
                const card = slots[slot];
                if (!card) continue;
                if (pinned.some((p) => isSame(p, card))) continue;

                const match = list.find((p) => isSame(p, card));
                if (match) pinned.push(match);
            }
        }

        const rest = list.filter((p) => !pinned.some((pin) => isSame(pin, p)));
        allPrintings[name] = [...pinned, ...rest].slice(0, MAX_PRINTINGS_PER_CARD);
    }

    const final = [];
    const printingsAttached = new Set();

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
                // Nonfoil market price, falling back to foil for foil-only printings.
                prices_usd: card.prices?.usd ?? card.prices?.usd_foil ?? null,
            };

            const deckLimit = detectDeckLimit(card);
            if (deckLimit !== undefined) {
                base.deck_limit = deckLimit;
            }

            // Alternate arts/printings the user can pick between. Attached
            // to only one of this name's paper/arena/mtgo entries — they'd
            // otherwise all carry an identical copy of the same array,
            // multiplying the dataset size for no reason. Omitted entirely
            // when there's only the one printing — nothing to pick from.
            if (
                allPrintings[name] &&
                allPrintings[name].length > 1 &&
                !printingsAttached.has(name)
            ) {
                base.printings = allPrintings[name];
                printingsAttached.add(name);
            }

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

    // Only lib/data is read (server-side only, via fs.readFileSync in
    // lib/cardDataStore.ts) — nothing fetches a public copy client-side.
    const libDir = path.join(process.cwd(), "lib/data");
    if (!fs.existsSync(libDir)) fs.mkdirSync(libDir, { recursive: true });

    const libPath = path.join(libDir, "cards-min.json");
    fs.writeFileSync(libPath, JSON.stringify(final));

    const sizeMB = (fs.statSync(libPath).size / 1024 / 1024).toFixed(2);
    console.log(`Done. Wrote ${final.length} cards (${sizeMB} MB)`);

    console.log("Building Standard rotation dataset...");
    const rotationCards = {};
    for (const [name, entry] of Object.entries(rotationIndex)) {
        rotationCards[name] = { sets: [...entry.sets.values()], image: entry.image };
    }

    const rotatingOutSetsInfo = [...ROTATING_OUT_SETS].map((code) => ({
        set: code,
        set_name: setInfoMap[code]?.name ?? code.toUpperCase(),
        set_icon_svg_uri: setIconMap[code] ?? null,
    }));

    const rotationOutput = {
        generatedAt: new Date().toISOString(),
        rotationDate: ROTATION_DATE,
        rotatingOutSets: rotatingOutSetsInfo,
        cards: rotationCards,
    };

    const rotationPath = path.join(libDir, "standard-rotation.json");
    fs.writeFileSync(rotationPath, JSON.stringify(rotationOutput));

    const rotationSizeMB = (fs.statSync(rotationPath).size / 1024 / 1024).toFixed(2);
    console.log(`Wrote Standard rotation dataset: ${Object.keys(rotationCards).length} cards (${rotationSizeMB} MB)`);
}

run().catch((e) => {
    console.error(e);
    process.exit(1);
});
