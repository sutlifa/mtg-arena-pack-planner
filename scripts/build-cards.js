// scripts/build-cards.js

const fs = require("fs");
const path = require("path");

const OUT_PATH = path.join(process.cwd(), "public/data/cards-min.json");
const ALIAS_PATH = path.join(process.cwd(), "public/data/card-aliases.json");

const EXCLUDED_SET_TYPES = new Set([
  "token",
  "memorabilia",
  "art_series",
  "funny",
  "minigame",
]);

const EXCLUDED_FRAME_EFFECTS = new Set([
  "promo",
  "extendedart",
  "showcase",
  "etched",
  "inverted",
  "retro",
  "borderless",
]);

const SECRET_LAIR = "sld";
const LIST_SET = "plist";

async function fetchSets() {
  console.log("Downloading Scryfall sets…");
  const sets = await fetch("https://api.scryfall.com/sets").then((r) => r.json());

  const map = {};
  for (const s of sets.data) {
    if (s.code && s.icon_svg_uri) {
      map[s.code.toLowerCase()] = s.icon_svg_uri;
    }
  }

  console.log(`Loaded ${Object.keys(map).length} set icons.`);
  return map;
}

async function fetchBulkData() {
  console.log("Downloading Scryfall bulk data…");

  const bulkIndex = await fetch("https://api.scryfall.com/bulk-data").then((r) =>
    r.json()
  );

  const defaultCards = bulkIndex.data.find((b) => b.type === "default_cards");
  if (!defaultCards) throw new Error("Could not find default_cards bulk data.");

  console.log("Downloading default_cards bulk file…");
  const allCards = await fetch(defaultCards.download_uri).then((r) => r.json());

  console.log(`Downloaded ${allCards.length} cards.`);
  return allCards;
}

function shouldExclude(card) {
  if (card.set === SECRET_LAIR) return true;
  if (card.set === LIST_SET) return true;
  if (EXCLUDED_SET_TYPES.has(card.set_type)) return true;

  if (card.frame_effects) {
    for (const fx of card.frame_effects) {
      if (EXCLUDED_FRAME_EFFECTS.has(fx)) return true;
    }
  }

  if (card.promo) return true;

  return false;
}

function minimizeCard(card, setIcons) {
  return {
    id: card.id,
    name: card.name,
    printed_name: card.printed_name ?? card.name,
    set: card.set,
    set_name: card.set_name,
    set_type: card.set_type,
    collector_number: card.collector_number,
    rarity: card.rarity,
    released_at: card.released_at ?? null,
    image_uris: card.image_uris ?? null,
    card_faces: card.card_faces ?? null,
    set_icon_svg_uri: setIcons[card.set.toLowerCase()] ?? null,
    arena_id: card.arena_id ?? null,
  };
}

// FINAL alias generator using oracle_id + frequency heuristic
function generateAliasMap(allCards) {
  const english = allCards.filter((c) => c.lang === "en" && c.oracle_id);

  // Group by oracle_id
  const groups = {};
  for (const card of english) {
    if (!groups[card.oracle_id]) groups[card.oracle_id] = [];
    groups[card.oracle_id].push(card);
  }

  const aliases = {};

  for (const oracleId in groups) {
    const cards = groups[oracleId];

    // Collect all distinct strings from name and printed_name
    const stats = new Map();

    for (const c of cards) {
      if (c.name) {
        const key = c.name.toLowerCase().trim();
        if (!stats.has(key)) stats.set(key, { nameCount: 0, printedCount: 0 });
        stats.get(key).nameCount += 1;
      }
      if (c.printed_name) {
        const key = c.printed_name.toLowerCase().trim();
        if (!stats.has(key)) stats.set(key, { nameCount: 0, printedCount: 0 });
        stats.get(key).printedCount += 1;
      }
    }

    const keys = Array.from(stats.keys());
    if (keys.length !== 2) continue; // only handle simple two-name cases

    const [a, b] = keys;
    const aStats = stats.get(a);
    const bStats = stats.get(b);

    // Choose canonical as the one that appears more often as a name
    let canonical, arena;
    if (aStats.nameCount > bStats.nameCount) {
      canonical = a;
      arena = b;
    } else if (bStats.nameCount > aStats.nameCount) {
      canonical = b;
      arena = a;
    } else {
      // tie or ambiguous, skip
      continue;
    }

    if (canonical && arena && canonical !== arena) {
      aliases[arena] = canonical;
    }
  }

  return aliases;
}

async function build() {
  const setIcons = await fetchSets();
  const allCards = await fetchBulkData();

  console.log("Filtering cards…");
  const filtered = allCards.filter((card) => !shouldExclude(card));

  console.log(`Remaining after filtering: ${filtered.length}`);

  console.log("Minimizing card data…");
  const minimized = filtered.map((card) => minimizeCard(card, setIcons));

  console.log("Writing cards-min.json…");
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(minimized, null, 2), "utf8");

  console.log("Generating alias map…");
  const aliasMap = generateAliasMap(allCards);
  fs.writeFileSync(ALIAS_PATH, JSON.stringify(aliasMap, null, 2), "utf8");

  console.log(`Alias map written with ${Object.keys(aliasMap).length} entries.`);

  console.log("Done!");
}

build().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});