// lib/nameUtils.ts

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")                     // split accents
    .replace(/[\u0300-\u036f]/g, "")       // remove accents
    .replace(/\/\/.*/g, "")                // remove DFC back face
    .replace(/[^a-z0-9 ]/g, " ")           // remove punctuation
    .replace(/\s+/g, " ")                  // collapse spaces
    .trim();
}