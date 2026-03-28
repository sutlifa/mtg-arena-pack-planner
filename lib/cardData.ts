// lib/cardData.ts
import fs from "fs/promises";
import path from "path";

export type ScryfallCard = {
  id: string;
  name: string;
  set: string;
  set_name: string;
  collector_number: string;
  rarity: string;
  released_at?: string;
  image_uris?: { normal?: string };
  set_icon_svg_uri?: string;
  card_faces?: Array<{
    name: string;
    image_uris?: { normal?: string };
  }>;
};

export type CardMap = Record<string, ScryfallCard[]>;
export type CardMapBySet = Record<string, ScryfallCard[]>;

let loaded = false;
let cardMap: CardMap = {};
let cardMapBySet: CardMapBySet = {};

async function loadCards() {
  if (loaded) return;

  const filePath = path.join(process.cwd(), "public/data/cards-min.json");
  const raw = await fs.readFile(filePath, "utf8");
  const cards = JSON.parse(raw) as ScryfallCard[];

  for (const card of cards) {
    const nameKey = card.name.toLowerCase();
    const setKey = `${card.name.toLowerCase()}|${card.set.toLowerCase()}`;

    if (!cardMap[nameKey]) cardMap[nameKey] = [];
    cardMap[nameKey].push(card);

    if (!cardMapBySet[setKey]) cardMapBySet[setKey] = [];
    cardMapBySet[setKey].push(card);
  }

  loaded = true;
}

export async function getCardMap(): Promise<CardMap> {
  await loadCards();
  return cardMap;
}

export async function getCardMapBySet(): Promise<CardMapBySet> {
  await loadCards();
  return cardMapBySet;
}