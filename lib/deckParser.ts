// lib/deckParser.ts
export function extractName(raw: string): string {
  let name = raw.trim();

  if (name.includes("//")) name = name.split("//")[0].trim();

  name = name.replace(/\([^)]*\)/g, "").trim();
  name = name.replace(/\b\d+[a-zA-Z]?\b/g, "").trim();
  name = name.replace(/[.,:;]+$/, "").trim();
  name = name.replace(/\s{2,}/g, " ");

  return name;
}

export function parseDecklist(text: string): Map<string, number> {
  const map = new Map<string, number>();

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    const match = line.match(/^(\d+)\s+(.+)$/);
    if (!match) continue;

    const qty = parseInt(match[1], 10);
    const name = extractName(match[2]);
    if (!name) continue;

    map.set(name, (map.get(name) ?? 0) + qty);
  }

  return map;
}