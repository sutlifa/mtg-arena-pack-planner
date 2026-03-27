import { extractName } from "./deckParser";

export function parseArenaCollection(text: string): Map<string, number> {
  const map = new Map<string, number>();
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const match = line.match(/^(\d+)\s+(.+)$/);
    if (!match) continue;

    const qty = Number(match[1]);
    const name = extractName(match[2]);

    map.set(name, (map.get(name) ?? 0) + qty);
  }

  return map;
}