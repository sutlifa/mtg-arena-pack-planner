import { NextResponse } from "next/server";
import { getAnalysis, deleteAnalysis } from "@/lib/saved";
import { requireUser, isGuardFailure, parseId } from "@/lib/savedRoutes";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
    const g = await requireUser();
    if (isGuardFailure(g)) return g.response;

    const id = parseId((await context.params).id);
    if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    try {
        const analysis = await getAnalysis(g.userId, id);
        if (!analysis) return NextResponse.json({ error: "Not found" }, { status: 404 });
        return NextResponse.json({ analysis });
    } catch (err) {
        console.error("GET ANALYSIS ERROR:", err);
        return NextResponse.json({ error: "Could not load that comparison" }, { status: 500 });
    }
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
    const g = await requireUser();
    if (isGuardFailure(g)) return g.response;

    const id = parseId((await context.params).id);
    if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    try {
        const removed = await deleteAnalysis(g.userId, id);
        if (!removed) return NextResponse.json({ error: "Not found" }, { status: 404 });
        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error("DELETE ANALYSIS ERROR:", err);
        return NextResponse.json({ error: "Could not delete that comparison" }, { status: 500 });
    }
}
