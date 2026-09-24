import { NextResponse } from "next/server";
import { tidyCollection } from "@/lib/collectionText";
import { listCollections, saveCollection } from "@/lib/saved";
import { requireUser, isGuardFailure, checkName, MAX_TEXT_BYTES } from "@/lib/savedRoutes";

export async function GET() {
    const g = await requireUser();
    if (isGuardFailure(g)) return g.response;

    try {
        return NextResponse.json({ collections: await listCollections(g.userId) });
    } catch (err) {
        console.error("LIST COLLECTIONS ERROR:", err);
        return NextResponse.json({ error: "Could not load your collections" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    const g = await requireUser();
    if (isGuardFailure(g)) return g.response;

    try {
        const { name, rawText, arenaMode } = await req.json();

        const nameError = checkName(name);
        if (nameError) return NextResponse.json({ error: nameError }, { status: 400 });

        if (typeof rawText !== "string" || !rawText.trim()) {
            return NextResponse.json({ error: "Nothing to save" }, { status: 400 });
        }
        if (rawText.length > MAX_TEXT_BYTES) {
            return NextResponse.json({ error: "That collection is too large to save" }, { status: 413 });
        }

        // Stored merged — one line per card, copies of every printing added
        // together — whichever page or tool sent it.
        const id = await saveCollection({
            userId: g.userId,
            name: String(name).trim(),
            rawText: tidyCollection(rawText),
            arenaMode: Boolean(arenaMode),
        });

        return NextResponse.json({ id, name: String(name).trim() });
    } catch (err) {
        console.error("SAVE COLLECTION ERROR:", err);
        return NextResponse.json({ error: "Could not save your collection" }, { status: 500 });
    }
}
