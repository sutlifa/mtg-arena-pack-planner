import { normalizeName } from "./nameUtils";

let aliasCache: Record<string, string> | null = null;
let reverseCache: Record<string, string> | null = null;

async function loadAliases() {
    if (aliasCache) return;

    const [generated, manual] = await Promise.all([
        fetch("/data/card-aliases.json").then(r => r.json()),
        fetch("/data/manual-aliases.json").then(r => r.json())
    ]);

    const normalizeMap = (map: Record<string, string>) => {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(map)) {
            out[normalizeName(k)] = normalizeName(v);
        }
        return out;
    };

    aliasCache = { ...normalizeMap(generated), ...normalizeMap(manual) };

    reverseCache = {};
    for (const [arena, printed] of Object.entries(aliasCache)) {
        reverseCache[printed] = arena;
    }
}

export async function resolveNameClient(name: string): Promise<string> {
    await loadAliases();

    const raw = name.toLowerCase().trim();
    const norm = normalizeName(raw);

    const candidates = [
        raw,
        norm,
        raw.replace(/-/g, " "),
        norm.replace(/-/g, " ")
    ];

    for (const c of candidates) {
        const key = normalizeName(c);
        if (aliasCache![key]) {
            return normalizeName(aliasCache![key]);
        }
    }

    return norm;
}

export async function getArenaNameClient(printed: string): Promise<string | null> {
    await loadAliases();
    return reverseCache![normalizeName(printed)] ?? null;
}