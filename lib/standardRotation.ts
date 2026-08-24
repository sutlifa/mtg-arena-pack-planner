// lib/standardRotation.ts

import fs from "fs";
import path from "path";
import { normalizeName } from "./nameUtils";
import { serverAliasMap } from "./serverAliasMap";

interface RotationSet {
    set: string;
    set_name: string;
    rotating: boolean;
}

interface RotationEntry {
    sets: RotationSet[];
}

interface RotationData {
    generatedAt: string;
    rotationDate: string;
    rotatingOutSets: { set: string; set_name: string }[];
    cards: Record<string, RotationEntry>;
}

let cache: RotationData | null = null;
let normalizedIndex: Map<string, RotationEntry> | null = null;

function load(): RotationData {
    if (!cache) {
        const filePath = path.join(process.cwd(), "lib/data/standard-rotation.json");
        const fileContents = fs.readFileSync(filePath, "utf8");
        cache = JSON.parse(fileContents);
    }
    return cache!;
}

function getIndex(): Map<string, RotationEntry> {
    if (!normalizedIndex) {
        normalizedIndex = new Map();
        for (const [name, entry] of Object.entries(load().cards)) {
            normalizedIndex.set(normalizeName(name), entry);
        }
    }
    return normalizedIndex;
}

export function getRotationMeta() {
    const data = load();
    return { rotationDate: data.rotationDate, rotatingOutSets: data.rotatingOutSets };
}

export interface RotationLookup {
    found: boolean;
    survives: boolean;
    sets: RotationSet[];
}

// Looks up whether a card (by name, as pasted in a decklist) is currently
// Standard-legal, and — if so — whether it has a printing outside the sets
// rotating out at the next Standard rotation. A card only counts as
// "rotating" when every Standard-legal printing it has is in a rotating
// set; if it's also printed in any surviving set (including an upcoming,
// not-yet-released one), it's safe.
export function lookupRotation(name: string): RotationLookup {
    const normalized = normalizeName(name);
    const alias = serverAliasMap[normalized];
    const key = alias ?? normalized;
    const entry = getIndex().get(key);

    if (!entry) return { found: false, survives: false, sets: [] };

    const survives = entry.sets.some((s) => !s.rotating);
    return { found: true, survives, sets: entry.sets };
}
