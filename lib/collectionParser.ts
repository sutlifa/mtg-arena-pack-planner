// lib/collectionParser.ts
import { extractName } from "./deckParser";

export function parseArenaCollection(text: string): Map<string, number> {
  const map = new Map<string, number>();

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    let qty: number | null = null;
    let rawName = line;

    let match = line.match(/^(\d+)\s+(.+)$/);
    if (match) {
      qty = parseInt(match[1], 10);
      rawName = match[2];
    }

    if (!qty) {
      match = line.match(/^(\d+)x\s+(.+)$/i);
      if (match) {
        qty = parseInt(match[1], 10);
        rawName = match[2];
      }
    }

    if (!qty) {
      match = line.match(/^(.+):\s*(\d+)$/);
      if (match) {
        rawName = match[1];
        qty = parseInt(match[2], 10);
      }
    }

    if (!qty) continue;

    const name = extractName(rawName);
    if (!name) continue;

    const setMatch = rawName.match(/\(([A-Za-z0-9]{2,5})\)/);
    const setCode = setMatch ? setMatch[1].toLowerCase() : null;

    map.set(name, (map.get(name) ?? 0) + qty);

    if (setCode) {
      const key = `${name}|${setCode}`;
      map.set(key, (map.get(key) ?? 0) + qty);
    }
  }

  return map;
}