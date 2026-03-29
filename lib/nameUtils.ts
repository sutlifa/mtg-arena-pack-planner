// lib/nameUtils.ts

export function normalizeName(name: string | undefined | null): string {
    if (!name || typeof name !== "string") return "";

    return name
        .toLowerCase()
        .normalize("NFKD")                     // split accents
        .replace(/[\u0300-\u036f]/g, "")       // remove accent marks
        .replace(/\/\/.*$/, "")                // strip MDFC back-face text
        .replace(/['’"“”]/g, "")               // remove all quotes
        .replace(/[-‐‑‒–—―]/g, " ")            // normalize all hyphens/dashes
        .replace(/[^\w ]+/g, " ")              // remove punctuation
        .replace(/\s+/g, " ")                  // collapse whitespace
        .trim();
}