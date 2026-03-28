// scripts/build-cards.js
const fs = require("fs");
const path = require("path");
const https = require("https");

const BULK_URL = "https://api.scryfall.com/bulk-data/default_cards";

// Helper to fetch JSON with required Scryfall headers
function fetchJsonWithHeaders(options) {
  return new Promise((resolve, reject) => {
    https
      .get(
        {
          hostname: options.hostname,
          path: options.path,
          headers: {
            "User-Agent": "mtg-arena-pack-planner (https://github.com/yourname)",
            Accept: "application/json",
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(e);
            }
          });
        }
      )
      .on("error", reject);
  });
}

async function main() {
  console.log("Fetching bulk metadata...");

  const meta = await fetchJsonWithHeaders({
    hostname: "api.scryfall.com",
    path: "/bulk-data/default_cards",
  });

  const downloadUrl = meta.download_uri;
  console.log("Downloading bulk cards from:", downloadUrl);

  const tmpPath = path.join(__dirname, "cards-raw.json");

  // Download the bulk file with headers
  await new Promise((resolve, reject) => {
    const file = fs.createWriteStream(tmpPath);

    const url = new URL(downloadUrl);

    https
      .get(
        {
          hostname: url.hostname,
          path: url.pathname + url.search,
          headers: {
            "User-Agent": "mtg-arena-pack-planner (https://github.com/yourname)",
            Accept: "application/json",
          },
        },
        (res) => {
          res.pipe(file);
          file.on("finish", () => file.close(resolve));
        }
      )
      .on("error", (err) => {
        fs.unlink(tmpPath, () => reject(err));
      });
  });

  console.log("Reading raw cards...");
  const raw = fs.readFileSync(tmpPath, "utf8");
  const cards = JSON.parse(raw);

  console.log("Filtering and minimizing...");
  const filtered = cards
    .filter((c) => c.lang === "en")
    .filter((c) => c.layout !== "token" && c.layout !== "art_series")
    .map((c) => ({
      id: c.id,
      name: c.name,
      set: c.set,
      set_name: c.set_name,
      collector_number: c.collector_number,
      rarity: c.rarity,
      released_at: c.released_at,
      image_uris: c.image_uris
        ? { normal: c.image_uris.normal ?? null }
        : undefined,
      set_icon_svg_uri: c.set_icon_svg_uri ?? null,
      card_faces: c.card_faces
        ? c.card_faces.map((f) => ({
            name: f.name,
            image_uris: f.image_uris
              ? { normal: f.image_uris.normal ?? null }
              : undefined,
          }))
        : undefined,
    }));

  const outPath = path.join(process.cwd(), "public", "data", "cards-min.json");
  fs.writeFileSync(outPath, JSON.stringify(filtered));

  fs.unlinkSync(tmpPath);
  console.log(`Done. Wrote ${filtered.length} cards to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});