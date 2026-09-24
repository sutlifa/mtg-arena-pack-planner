// lib/openCollection.ts

/**
 * Which saved collection the browser's working collection came from.
 *
 * The Pack Planner and the Collection page edit one collection, kept in
 * localStorage under COLLECTION_KEY. When that text was opened from (or saved
 * to) a profile collection, Save should update that row in place — so both
 * pages also need to know *which* row, and they share that under OPEN_KEY.
 *
 * The danger is the two keys drifting apart. Either page can replace the text
 * — load a different saved collection, Start Over, paste a new export — and a
 * ref left behind from before would then aim Save at the wrong row: the
 * header says "Editing A", the tiles show B, and Save writes B over A. So the
 * ref is never stored alone. It is stored with a fingerprint of the exact text
 * it belongs to, and a reader that finds the text no longer matches treats
 * the ref as gone. Every writer of COLLECTION_KEY rewrites OPEN_KEY alongside
 * it; the fingerprint is the backstop for whatever doesn't (an older tab, a
 * build from before this existed, a hand-edited devtools value).
 *
 * A fingerprint rather than a second copy of the text because an Arena
 * collection runs to hundreds of kilobytes and localStorage holds about five
 * megabytes for the whole site. Pure and dependency-free: the components do
 * the storage calls, this only decides what to write and whether to trust
 * what was read.
 */

/** The working collection text, shared by the Pack Planner and the Collection page. */
export const COLLECTION_KEY = "mtgpp:collection";
/** "arena" or "paper" — the mode that collection is being worked in. */
export const MODE_KEY = "mtgpp:collection-mode";
/** The saved row COLLECTION_KEY came from, with the fingerprint that ties them together. */
export const OPEN_KEY = "mtgpp:collection-open";

export interface OpenRef {
    id: number;
    name: string;
    arena: boolean;
}

/**
 * A short, stable summary of a text: its length plus a 53-bit hash (cyrb53).
 * Not cryptographic and doesn't need to be — it only has to notice that the
 * collection was replaced, and nobody is trying to forge a match against
 * their own browser.
 */
export function fingerprint(text: string): string {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < text.length; i++) {
        const ch = text.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
    return `${text.length}:${hash.toString(36)}`;
}

/** The OPEN_KEY value for `ref` open on `text`, or null when nothing is open. */
export function encodeOpen(ref: OpenRef | null, text: string): string | null {
    if (!ref || !text) return null;
    return JSON.stringify({ ref, text: fingerprint(text) });
}

/**
 * The ref stored in OPEN_KEY, if it still belongs to `text` — the value
 * currently under COLLECTION_KEY. Anything else (a mismatch, the old
 * ref-only shape, corrupt JSON) is "nothing open", which at worst makes the
 * next Save ask for a name instead of overwriting a row it shouldn't.
 */
export function decodeOpen(raw: string | null, text: string | null): OpenRef | null {
    if (!raw || !text) return null;
    try {
        const v = JSON.parse(raw);
        const ref = v?.ref;
        if (
            v?.text !== fingerprint(text) ||
            typeof ref?.id !== "number" ||
            typeof ref?.name !== "string" ||
            typeof ref?.arena !== "boolean"
        ) {
            return null;
        }
        return { id: ref.id, name: ref.name, arena: ref.arena };
    } catch {
        return null;
    }
}
