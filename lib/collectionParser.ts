import { extractName } from "./deckParser";

export function parseArenaCollection(text: string): Map<string, number> {
  const map = new Map<string, number>();

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  for (const line of lines) {
    let qty: number | null = null;
    let rawName = line;

    let match = line.match(/^(\d+)\s+(.+)$/);
    if (match) {
      qty = parseInt(match[1], 10);
      rawName = match[2];
    }

    match = line.match(/^(\d+)x\s+(.+)$/i);
    if (!qty && match) {
      qty = parseInt(match[1], 10);
      rawName = match[2];
    }

    match = line.match(/^(.+):\s*(\d+)$/);
    if (!qty && match) {
      rawName = match[1];
      qty = parseInt(match[2], 10);
    }

    if (!qty) continue;

    const name = extractName(rawName);
    if (!name) continue;

    const current = map.get(name) ?? 0;
    map.set(name, current + qty);
  }

  return map;
}