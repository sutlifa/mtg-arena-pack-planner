import { NextResponse } from "next/server";
import { getAnalysis, deleteAnalysis, updateAnalysis } from "@/lib/saved";
import {
    requireUser,
    isGuardFailure,
    isUniqueViolation,
    checkName,
    parseId,
    MAX_TEXT_BYTES,
} from "@/lib/savedRoutes";

/** Same ceiling as POST /api/analyses. */
const MAX_DECKS = 20;

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

/** Overwrite the comparison the planner has open. See /api/collections/[id]. */
export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
    const g = await requireUser();
    if (isGuardFailure(g)) return g.response;

    const id = parseId((await context.params).id);
    if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    let name: string | null = null;

    try {
        const body = await req.json();
        const { decklists, collection, arenaMode } = body;

        if (body.name !== undefined) {
            const nameError = checkName(body.name);
            if (nameError) return NextResponse.json({ error: nameError }, { status: 400 });
            name = String(body.name).trim();
        }

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

        const updated = await updateAnalysis({
            userId: g.userId,
            id,
            name,
            decklists: decks,
            collection: collectionText,
            arenaMode: Boolean(arenaMode),
        });
        if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

        return NextResponse.json(updated);
    } catch (err) {
        if (isUniqueViolation(err)) {
            return NextResponse.json(
                { error: `You already have a comparison called "${name}"` },
                { status: 409 }
            );
        }
        console.error("UPDATE ANALYSIS ERROR:", err);
        return NextResponse.json({ error: "Could not save your comparison" }, { status: 500 });
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
