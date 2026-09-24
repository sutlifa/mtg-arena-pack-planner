import { NextResponse } from "next/server";
import { tidyCollection } from "@/lib/collectionText";
import { getCollection, deleteCollection, updateCollection } from "@/lib/saved";
import {
    requireUser,
    isGuardFailure,
    isUniqueViolation,
    checkName,
    parseId,
    MAX_TEXT_BYTES,
} from "@/lib/savedRoutes";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
    const g = await requireUser();
    if (isGuardFailure(g)) return g.response;

    const id = parseId((await context.params).id);
    if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    try {
        const collection = await getCollection(g.userId, id);
        // Someone else's row is reported missing rather than forbidden, so the
        // response can't be used to confirm that an id exists.
        if (!collection) return NextResponse.json({ error: "Not found" }, { status: 404 });
        return NextResponse.json({ collection });
    } catch (err) {
        console.error("GET COLLECTION ERROR:", err);
        return NextResponse.json({ error: "Could not load that collection" }, { status: 500 });
    }
}

/**
 * Overwrite the collection the planner currently has open.
 *
 * POSTing to /api/collections keys the upsert on (name, arena_mode), so
 * flipping Arena/Paper on an open collection would leave the original behind
 * and write a second row. Updating by id keeps "Save" pointed at the
 * collection on screen even when the name or the mode is what changed.
 */
export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
    const g = await requireUser();
    if (isGuardFailure(g)) return g.response;

    const id = parseId((await context.params).id);
    if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    let name: string | null = null;

    try {
        const body = await req.json();
        const { rawText, arenaMode } = body;

        if (body.name !== undefined) {
            const nameError = checkName(body.name);
            if (nameError) return NextResponse.json({ error: nameError }, { status: 400 });
            name = String(body.name).trim();
        }

        if (typeof rawText !== "string" || !rawText.trim()) {
            return NextResponse.json({ error: "Nothing to save" }, { status: 400 });
        }
        if (rawText.length > MAX_TEXT_BYTES) {
            return NextResponse.json({ error: "That collection is too large to save" }, { status: 413 });
        }

        // Stored merged — one line per card, copies of every printing added
        // together — whichever page or tool sent it.
        const updated = await updateCollection({
            userId: g.userId,
            id,
            name,
            rawText: tidyCollection(rawText),
            arenaMode: Boolean(arenaMode),
        });
        if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

        return NextResponse.json(updated);
    } catch (err) {
        if (isUniqueViolation(err)) {
            return NextResponse.json(
                { error: `You already have a collection called "${name}" in that mode` },
                { status: 409 }
            );
        }
        console.error("UPDATE COLLECTION ERROR:", err);
        return NextResponse.json({ error: "Could not save your collection" }, { status: 500 });
    }
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
    const g = await requireUser();
    if (isGuardFailure(g)) return g.response;

    const id = parseId((await context.params).id);
    if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    try {
        const removed = await deleteCollection(g.userId, id);
        if (!removed) return NextResponse.json({ error: "Not found" }, { status: 404 });
        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error("DELETE COLLECTION ERROR:", err);
        return NextResponse.json({ error: "Could not delete that collection" }, { status: 500 });
    }
}
