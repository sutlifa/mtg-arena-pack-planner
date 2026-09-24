import { NextResponse } from "next/server";
import { tidyCollection } from "@/lib/collectionText";
import { listAnalyses, saveAnalysis } from "@/lib/saved";
import { requireUser, isGuardFailure, checkName, MAX_TEXT_BYTES } from "@/lib/savedRoutes";

const MAX_DECKS = 20;

export async function GET() {
    const g = await requireUser();
    if (isGuardFailure(g)) return g.response;

    try {
        return NextResponse.json({ analyses: await listAnalyses(g.userId) });
    } catch (err) {
        console.error("LIST ANALYSES ERROR:", err);
        return NextResponse.json({ error: "Could not load your comparisons" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    const g = await requireUser();
    if (isGuardFailure(g)) return g.response;

    try {
        const { name, decklists, collection, arenaMode } = await req.json();

        const nameError = checkName(name);
        if (nameError) return NextResponse.json({ error: nameError }, { status: 400 });

        if (!Array.isArray(decklists) || decklists.every((d) => typeof d !== "string" || !d.trim())) {
            return NextResponse.json({ error: "Nothing to save" }, { status: 400 });
        }
        if (decklists.length > MAX_DECKS) {
            return NextResponse.json({ error: `Too many decks (max ${MAX_DECKS})` }, { status: 400 });
        }

        const decks = decklists.filter((d): d is string => typeof d === "string");
        const collectionText = typeof collection === "string" ? collection : "";

        const total = decks.join("").length + collectionText.length;
        if (total > MAX_TEXT_BYTES) {
            return NextResponse.json({ error: "That comparison is too large to save" }, { status: 413 });
        }

        const id = await saveAnalysis({
            userId: g.userId,
            name: String(name).trim(),
            decklists: decks,
            // Merged like a saved collection: one line per card.
            collection: tidyCollection(collectionText),
            arenaMode: Boolean(arenaMode),
        });

        return NextResponse.json({ id, name: String(name).trim() });
    } catch (err) {
        console.error("SAVE ANALYSIS ERROR:", err);
        return NextResponse.json({ error: "Could not save your comparison" }, { status: 500 });
    }
}
