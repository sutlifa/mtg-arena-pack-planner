export function normalizeLine(line: string) {
  return line
    .replace(/\u00A0/g, " ")
    .replace(/^●\s*/u, "")
    .replace(/^SB:\s*/i, "")
    .replace(/^Sideboard\s*/i, "")
    .replace(/^Commander\s*/i, "")
    .replace(/^Companion\s*/i, "")
    .replace(/^\/\/.*$/i, "")
    .trim();
}

export function extractName(raw: string) {
  let name = raw.trim();

  name = name.replace(/\s+\([^)]*\)\s+[A-Za-z0-9★-]+\s*$/u, "");
  name = name.replace(/\s+\([^)]*\)\s*$/u, "");

  return name.trim();
}

export function parseDecklist(text: string): Map<string, number> {
  const map = new Map<string, number>();
  const lines = text.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = normalizeLine(rawLine);
    if (!line) continue;

    const match = line.match(/^(\d+)[xX]?\s+(.+)$/u);
    if (!match) continue;

    const qty = Number(match[1]);
    const name = extractName(match[2]);

    if (!name) continue;
    map.set(name, (map.get(name) ?? 0) + qty);
  }

  return map;
}