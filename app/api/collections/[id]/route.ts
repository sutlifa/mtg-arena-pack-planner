import { NextResponse } from "next/server";
import { getCollection, deleteCollection } from "@/lib/saved";
import { requireUser, isGuardFailure, parseId } from "@/lib/savedRoutes";

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
