// lib/lineParse.ts

/**
 * Pulls "4 Lightning Bolt" apart into a quantity and a name.
 *
 * This lives on its own, with no imports, because both server and client code
 * need it: lib/deckParser (server, pulls in the card database) and
 * lib/deckSections (runs in the browser). Leaving it in deckParser dragged the
 * whole Node-only card store into the client bundle and broke the build.
 */
export function extractQtyAndName(line: string): { qty: number; rawName: string } | null {
    let m = line.match(/^(\d+)\s+(.+)$/);
    if (m) return { qty: parseInt(m[1], 10), rawName: m[2].trim() };

    m = line.match(/^(\d+)x\s+(.+)$/i);
    if (m) return { qty: parseInt(m[1], 10), rawName: m[2].trim() };

    m = line.match(/^(.+)\s+(\d+)$/);
    if (m) return { qty: parseInt(m[2], 10), rawName: m[1].trim() };

    return null;
}
