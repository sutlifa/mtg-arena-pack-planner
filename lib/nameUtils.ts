export function normalizeName(name: string | undefined | null): string {
    if (!name || typeof name !== "string") return "";

    return name
        .toLowerCase()
        .normalize("NFKD")                     // split accents
        .replace(/[\u0300-\u036f]/g, "")       // remove accent marks
        .replace(/\/\/.*$/, "")                // strip MDFC back-face text

        // ⭐ strip set codes like (M3C), (FIN), (DMU)
        .replace(/\([a-z0-9]{2,5}\)/gi, "")

        // ⭐ strip collector numbers like 185a, 178, 180
        .replace(/\b\d+[a-z]?\b/gi, "")

        // remove all quotes
        .replace(/['’"“”]/g, "")

        // normalize all hyphens/dashes
        .replace(/[-‐‑‒–—―]/g, " ")

        // remove remaining punctuation
        .replace(/[^\w ]+/g, " ")

        // collapse whitespace
        .replace(/\s+/g, " ")
        .trim();
}